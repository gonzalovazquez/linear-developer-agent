import Anthropic from '@anthropic-ai/sdk';
import { FileOperations, FileChange } from './file-operations';

export interface CodeGenerationResult {
  changes: FileChange[];
  summary: string;
  testingNotes: string;
  thinkingProcess?: string;
}

export class CodeGenerator {
  private anthropic: Anthropic;
  private fileOps: FileOperations;

  constructor(apiKey: string, repoPath: string) {
    this.anthropic = new Anthropic({ apiKey });
    this.fileOps = new FileOperations(repoPath);
  }

  /**
   * Generate code implementation for a Linear issue
   */
  async generateImplementation(issue: any): Promise<CodeGenerationResult> {
    console.log(`\n🤖 Claude is analyzing and implementing the issue...`);

    // 0. Prepare issue data with labels
    const labels = await issue.labels();
    const labelNames = labels?.nodes?.map((l: any) => l.name).join(', ') || 'None';
    const issueData = {
      ...issue,
      labelNames, // Add formatted labels
    };

    // 1. Gather context - read relevant files
    const context = await this.gatherContext(issue);

    // 2. Generate implementation
    const implementation = await this.generateWithClaude(issueData, context);

    // 3. Parse and extract file changes
    const changes = this.parseFileChanges(implementation.content);

    return {
      changes,
      summary: implementation.summary,
      testingNotes: implementation.testingNotes,
      thinkingProcess: implementation.thinking,
    };
  }

  /**
   * Gather context by reading relevant files
   */
  private async gatherContext(issue: any): Promise<Map<string, string>> {
    const context = new Map<string, string>();

    // Extract file paths from issue description
    const mentionedFiles = this.fileOps.extractFilePaths(issue.description);
    console.log(`📚 Found ${mentionedFiles.length} files mentioned in issue`);

    // Read mentioned files
    for (const filePath of mentionedFiles) {
      try {
        const content = await this.fileOps.readFile(filePath);
        context.set(filePath, content);
      } catch (error) {
        console.log(`⚠️  Could not read ${filePath}, will create it`);
      }
    }

    // Find additional relevant files based on keywords
    const keywords = this.extractKeywords(issue.title + ' ' + issue.description);
    const relevantFiles = await this.fileOps.findRelevantFiles(keywords);

    console.log(`🔍 Found ${relevantFiles.length} potentially relevant files`);

    for (const filePath of relevantFiles.slice(0, 3)) { // Limit to 3 extra files
      if (!context.has(filePath)) {
        try {
          const content = await this.fileOps.readFile(filePath);
          context.set(filePath, content);
        } catch (error) {
          // Skip files we can't read
        }
      }
    }

    console.log(`📖 Read ${context.size} files for context`);
    return context;
  }

  /**
   * Generate implementation using Claude with extended thinking
   */
  private async generateWithClaude(
    issue: any,
    context: Map<string, string>
  ): Promise<{
    content: string;
    summary: string;
    testingNotes: string;
    thinking: string;
  }> {
    const prompt = this.buildPrompt(issue, context);

    console.log(`🧠 Sending to Claude...`);

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }],
    });

    // Extract response
    let content = '';

    for (const block of message.content) {
      if (block.type === 'text') {
        content = block.text;
      }
    }

    const summary = this.extractSection(content, 'Implementation Summary');
    const testingNotes = this.extractSection(content, 'Testing Notes');

    return { content, summary, testingNotes, thinking: '' };
  }

  /**
   * Build comprehensive prompt for Claude
   */
  private buildPrompt(issue: any, context: Map<string, string>): string {
    const contextFiles = Array.from(context.entries())
      .map(([path, content]) => {
        return `### File: ${path}\n\`\`\`swift\n${content}\n\`\`\`\n`;
      })
      .join('\n');

    return `You are an expert iOS Swift developer working on the AWS Exam Helper app. You will implement a complete solution for the following Linear issue.

# Issue Details

**ID:** ${issue.identifier}
**Title:** ${issue.title}
**Priority:** ${issue.priority || 'Normal'}
**Labels:** ${issue.labelNames || 'None'}

**Description:**
${issue.description}

# Existing Code Context

${contextFiles || 'No existing files provided - you may need to create new files.'}

# Your Task

Implement a COMPLETE, PRODUCTION-READY solution for this issue. You must:

1. **Analyze** the issue requirements thoroughly
2. **Read** and understand the existing code
3. **Implement** the exact changes needed
4. **Follow** Swift and SwiftUI best practices
5. **Ensure** code is secure and handles errors
6. **Match** the existing code style

# Output Format

Provide your implementation in this EXACT format:

## Implementation Summary
[2-3 sentence summary of what you implemented]

## File Changes

For each file that needs to be created or modified, use this format:

### FILE: path/to/file.swift
### ACTION: create|modify|delete
\`\`\`swift
[COMPLETE file contents here - the ENTIRE file, not just snippets]
\`\`\`

### FILE: path/to/another/file.swift
### ACTION: modify
\`\`\`swift
[COMPLETE file contents]
\`\`\`

## Testing Notes
[How to test this implementation]

# Important Guidelines

- **ALWAYS provide COMPLETE file contents**, not diffs or partial code
- **ALWAYS use the exact format** shown above (### FILE:, ### ACTION:, etc.)
- **PRESERVE existing functionality** - don't break working code
- **ADD appropriate error handling** for all operations
- **FOLLOW security best practices** (no hardcoded secrets, validate inputs, etc.)
- **MAINTAIN consistency** with existing code style
- **TEST your logic** mentally before providing the code

Begin your implementation:`;
  }

  /**
   * Parse file changes from Claude's response
   */
  private parseFileChanges(response: string): FileChange[] {
    const changes: FileChange[] = [];

    // Match pattern: ### FILE: path ### ACTION: action ```lang content ```
    const fileBlockRegex = /### FILE:\s*([^\n]+)\s*### ACTION:\s*(create|modify|delete)\s*```[\w]*\n([\s\S]*?)```/gi;

    let match;
    while ((match = fileBlockRegex.exec(response)) !== null) {
      const filePath = match[1].trim();
      const action = match[2].trim().toLowerCase() as 'create' | 'modify' | 'delete';
      const content = match[3];

      changes.push({
        filePath,
        action,
        content: content,
      });

      console.log(`📄 Parsed ${action} for: ${filePath}`);
    }

    if (changes.length === 0) {
      console.log(`⚠️  No file changes found in expected format`);
      console.log(`Response preview: ${response.substring(0, 500)}...`);
    }

    return changes;
  }

  /**
   * Extract a section from Claude's response
   */
  private extractSection(content: string, sectionName: string): string {
    const regex = new RegExp(`##\\s*${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : `${sectionName} not provided`;
  }

  /**
   * Extract keywords from issue text
   */
  private extractKeywords(text: string): string[] {
    // Extract meaningful words (longer than 3 chars, not common words)
    const commonWords = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'been']);

    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !commonWords.has(w));

    return Array.from(new Set(words)).slice(0, 5);
  }
}

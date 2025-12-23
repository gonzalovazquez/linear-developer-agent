import Anthropic from '@anthropic-ai/sdk';
import { GitHubFileOperations, GitHubFile } from './github-file-operations';

export interface CloudCodeGenerationResult {
  files: GitHubFile[];
  summary: string;
  testingNotes: string;
}

export class CloudCodeGenerator {
  private anthropic: Anthropic;
  private github: GitHubFileOperations;

  constructor(apiKey: string, github: GitHubFileOperations) {
    this.anthropic = new Anthropic({ apiKey });
    this.github = github;
  }

  /**
   * Generate code implementation for a Linear issue (cloud-native)
   */
  async generateImplementation(issue: any): Promise<CloudCodeGenerationResult> {
    console.log(`\n🤖 Claude is analyzing and implementing (cloud-native)...`);

    // 1. Prepare issue data with labels
    const labels = await issue.labels();
    const labelNames = labels?.nodes?.map((l: any) => l.name).join(', ') || 'None';
    const issueData = {
      ...issue,
      labelNames,
    };

    // 2. Gather context from GitHub
    const context = await this.gatherContextFromGitHub(issueData);

    // 3. Generate implementation with Claude
    const implementation = await this.generateWithClaude(issueData, context);

    // 4. Parse file changes
    const files = this.parseFileChanges(implementation.content);

    return {
      files,
      summary: implementation.summary,
      testingNotes: implementation.testingNotes,
    };
  }

  /**
   * Gather context by reading files from GitHub
   */
  private async gatherContextFromGitHub(issue: any): Promise<Map<string, string>> {
    const context = new Map<string, string>();

    // Extract file paths from issue description
    const mentionedFiles = this.github.extractFilePaths(issue.description);
    console.log(`📚 Found ${mentionedFiles.length} files mentioned in issue`);

    // Read mentioned files from GitHub
    const fileContents = await this.github.readFiles(mentionedFiles);
    fileContents.forEach((content, path) => {
      if (content) {
        context.set(path, content);
      }
    });

    // Find additional relevant files
    const keywords = this.extractKeywords(issue.title + ' ' + issue.description);

    // Search GitHub for relevant files
    for (const keyword of keywords.slice(0, 2)) {
      const foundFiles = await this.github.searchFiles(keyword);

      for (const filePath of foundFiles.slice(0, 2)) {
        if (!context.has(filePath)) {
          try {
            const { content } = await this.github.readFile(filePath);
            if (content) {
              context.set(filePath, content);
            }
          } catch (e) {
            // Skip files we can't read
          }
        }
      }
    }

    console.log(`📖 Read ${context.size} files from GitHub for context`);
    return context;
  }

  /**
   * Generate implementation using Claude
   */
  private async generateWithClaude(
    issue: any,
    context: Map<string, string>
  ): Promise<{
    content: string;
    summary: string;
    testingNotes: string;
  }> {
    const prompt = this.buildPrompt(issue, context);

    console.log(`🧠 Sending to Claude...`);

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }],
    });

    let content = '';
    for (const block of message.content) {
      if (block.type === 'text') {
        content = block.text;
      }
    }

    const summary = this.extractSection(content, 'Implementation Summary');
    const testingNotes = this.extractSection(content, 'Testing Notes');

    return { content, summary, testingNotes };
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
\`\`\`swift
[COMPLETE file contents here - the ENTIRE file, not just snippets]
\`\`\`

### FILE: path/to/another/file.swift
\`\`\`swift
[COMPLETE file contents]
\`\`\`

## Testing Notes
[How to test this implementation]

# Important Guidelines

- **ALWAYS provide COMPLETE file contents**, not diffs or partial code
- **ALWAYS use the exact format** shown above (### FILE:, code blocks)
- **PRESERVE existing functionality** - don't break working code
- **ADD appropriate error handling** for all operations
- **FOLLOW security best practices** (no hardcoded secrets, validate inputs, etc.)
- **MAINTAIN consistency** with existing code style

Begin your implementation:`;
  }

  /**
   * Parse file changes from Claude's response
   */
  private parseFileChanges(response: string): GitHubFile[] {
    const files: GitHubFile[] = [];

    // Match pattern: ### FILE: path ```lang content ```
    const fileBlockRegex = /### FILE:\s*([^\n]+)\s*```[\w]*\n([\s\S]*?)```/gi;

    let match;
    while ((match = fileBlockRegex.exec(response)) !== null) {
      const path = match[1].trim();
      const content = match[2];

      files.push({
        path,
        content,
      });

      console.log(`📄 Parsed file: ${path} (${content.length} chars)`);
    }

    if (files.length === 0) {
      console.log(`⚠️  No file changes found in expected format`);
      console.log(`Response preview: ${response.substring(0, 500)}...`);
    }

    return files;
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
    const commonWords = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'been']);

    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !commonWords.has(w));

    return Array.from(new Set(words)).slice(0, 5);
  }
}

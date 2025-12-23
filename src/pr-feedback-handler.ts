import { Octokit } from '@octokit/rest';
import Anthropic from '@anthropic-ai/sdk';
import { GitHubFileOperations, GitHubFile } from './github-file-operations';

export interface PRFeedback {
  prNumber: number;
  comment: string;
  author: string;
  commentId: number;
}

/**
 * Handles interactive feedback on GitHub PRs
 * Users can comment on PRs and Claude will respond with code updates
 */
export class PRFeedbackHandler {
  private octokit: Octokit;
  private anthropic: Anthropic;
  private github: GitHubFileOperations;
  private owner: string;
  private repo: string;

  constructor() {
    this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    this.github = new GitHubFileOperations(
      process.env.GITHUB_TOKEN!,
      process.env.GITHUB_OWNER!,
      process.env.GITHUB_REPO!
    );
    this.owner = process.env.GITHUB_OWNER!;
    this.repo = process.env.GITHUB_REPO!;
  }

  /**
   * Process feedback from a PR comment
   */
  async processFeedback(feedback: PRFeedback): Promise<void> {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`💬 Processing PR Feedback`);
    console.log(`📋 PR #${feedback.prNumber}`);
    console.log(`👤 Author: ${feedback.author}`);
    console.log(`${'='.repeat(80)}\n`);

    try {
      // 1. Get PR details
      const pr = await this.getPRDetails(feedback.prNumber);

      // 2. Get current files in the PR
      const prFiles = await this.getPRFiles(feedback.prNumber);

      // 3. Read current file contents from the PR branch
      const fileContents = await this.readPRFiles(pr.head.ref, prFiles);

      // 4. Send to Claude for analysis and updates
      const updates = await this.getClaudeUpdates(feedback, pr, fileContents);

      if (updates.files.length === 0) {
        await this.replyToComment(feedback, '✅ No code changes needed based on your feedback.');
        return;
      }

      // 5. Commit updates to the same PR branch
      await this.github.commitFiles(
        pr.head.ref,
        updates.files,
        `refactor: Address PR feedback

${feedback.comment.substring(0, 200)}${feedback.comment.length > 200 ? '...' : ''}

🤖 Updated based on PR feedback`
      );

      // 6. Reply to the comment
      await this.replyToComment(
        feedback,
        `✅ I've updated the code based on your feedback!

**Changes made:**
${updates.files.map(f => `- ${f.path}`).join('\n')}

**Summary:**
${updates.summary}

The changes have been pushed to this PR. Please review!`
      );

      console.log(`✅ Feedback processed and PR updated`);
    } catch (error) {
      console.error(`❌ Error processing feedback:`, error);

      await this.replyToComment(
        feedback,
        `❌ I encountered an error processing your feedback. Please try rephrasing or contact the maintainer.

Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get PR details
   */
  private async getPRDetails(prNumber: number): Promise<any> {
    const { data: pr } = await this.octokit.pulls.get({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });
    return pr;
  }

  /**
   * Get list of files changed in PR
   */
  private async getPRFiles(prNumber: number): Promise<string[]> {
    const { data: files } = await this.octokit.pulls.listFiles({
      owner: this.owner,
      repo: this.repo,
      pull_number: prNumber,
    });

    return files.map(f => f.filename);
  }

  /**
   * Read file contents from PR branch
   */
  private async readPRFiles(branch: string, filePaths: string[]): Promise<Map<string, string>> {
    return await this.github.readFiles(filePaths, branch);
  }

  /**
   * Get updates from Claude based on feedback
   */
  private async getClaudeUpdates(
    feedback: PRFeedback,
    pr: any,
    currentFiles: Map<string, string>
  ): Promise<{ files: GitHubFile[]; summary: string }> {
    console.log(`🤖 Asking Claude to address feedback...`);

    const prompt = this.buildFeedbackPrompt(feedback, pr, currentFiles);

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

    const files = this.parseFileChanges(content);
    const summary = this.extractSection(content, 'Summary');

    console.log(`📝 Claude generated ${files.length} file updates`);

    return { files, summary };
  }

  /**
   * Build prompt for Claude to process feedback
   */
  private buildFeedbackPrompt(
    feedback: PRFeedback,
    pr: any,
    currentFiles: Map<string, string>
  ): string {
    const filesContext = Array.from(currentFiles.entries())
      .map(([path, content]) => {
        return `### Current File: ${path}\n\`\`\`swift\n${content}\n\`\`\`\n`;
      })
      .join('\n');

    return `You are reviewing code in a GitHub Pull Request and need to address feedback from a reviewer.

# Pull Request Context

**PR Title:** ${pr.title}
**PR Description:**
${pr.body}

# Current Files in PR

${filesContext}

# Reviewer Feedback

**From:** ${feedback.author}
**Comment:**
${feedback.comment}

# Your Task

Address the reviewer's feedback by modifying the code as requested. Analyze the feedback carefully and make the necessary changes.

# Output Format

Provide your response in this format:

## Summary
[Brief summary of changes made to address the feedback]

## File Changes

For each file you need to modify:

### FILE: path/to/file.swift
\`\`\`swift
[COMPLETE updated file contents]
\`\`\`

# Important

- **Address the specific feedback** given by the reviewer
- **Maintain all existing functionality** unless the feedback requests changes
- **Provide COMPLETE file contents**, not diffs
- **Follow Swift and SwiftUI best practices**
- **If no code changes are needed**, just provide a summary explaining why

Begin your response:`;
  }

  /**
   * Parse file changes from Claude's response
   */
  private parseFileChanges(response: string): GitHubFile[] {
    const files: GitHubFile[] = [];
    const fileBlockRegex = /### FILE:\s*([^\n]+)\s*```[\w]*\n([\s\S]*?)```/gi;

    let match;
    while ((match = fileBlockRegex.exec(response)) !== null) {
      const path = match[1].trim();
      const content = match[2];

      files.push({ path, content });
      console.log(`📄 Parsed update for: ${path}`);
    }

    return files;
  }

  /**
   * Extract section from response
   */
  private extractSection(content: string, sectionName: string): string {
    const regex = new RegExp(`##\\s*${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : 'Updated based on feedback';
  }

  /**
   * Reply to a PR comment
   */
  private async replyToComment(feedback: PRFeedback, message: string): Promise<void> {
    await this.octokit.issues.createComment({
      owner: this.owner,
      repo: this.repo,
      issue_number: feedback.prNumber,
      body: message,
    });

    console.log(`💬 Replied to comment`);
  }

  /**
   * Check if comment should trigger Claude
   * Triggers on @claude or /claude prefix
   */
  shouldProcessComment(comment: string, author: string): boolean {
    // Don't process comments from bots
    if (author.includes('[bot]')) {
      return false;
    }

    const normalized = comment.toLowerCase().trim();

    // Trigger on @claude or /claude
    return normalized.includes('@claude') || normalized.startsWith('/claude');
  }
}

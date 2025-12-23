import Anthropic from '@anthropic-ai/sdk';
import { LinearClient } from '@linear/sdk';
import { Octokit } from '@octokit/rest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ClaudeAutomation {
  private anthropic: Anthropic;
  private linear: LinearClient;
  private octokit: Octokit;
  private repoPath: string;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    this.linear = new LinearClient({
      apiKey: process.env.LINEAR_API_KEY!,
    });

    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });

    this.repoPath = process.env.REPO_PATH || '/Users/gvazquez/Development/AWS-Exam-Helper';
  }

  /**
   * Main entry point - processes a Linear issue from start to PR
   */
  async processIssue(issueId: string): Promise<void> {
    console.log(`\n🚀 Starting automation for issue: ${issueId}`);

    try {
      // 1. Fetch issue details from Linear
      const issue = await this.getLinearIssue(issueId);
      if (!issue) {
        throw new Error(`Issue ${issueId} not found`);
      }

      console.log(`📋 Issue: ${issue.title}`);

      // Safely access labels - Linear SDK returns labels as an async collection
      const labels = await issue.labels();
      const labelNames = labels?.nodes?.map((l: any) => l.name).join(', ') || 'No labels';
      console.log(`🏷️  Labels: ${labelNames}`);
      console.log(`⚠️  Priority: ${issue.priority || 'Not set'}`);

      // 2. Create branch
      const branchName = issue.branchName || `${issueId.toLowerCase()}-${this.slugify(issue.title)}`;
      await this.createBranch(branchName);

      // 3. Use Claude to implement the solution
      const implementation = await this.implementWithClaude(issue);

      // 4. Commit and push changes
      await this.commitAndPush(branchName, issue, implementation);

      // 5. Create Pull Request
      const prUrl = await this.createPullRequest(branchName, issue, implementation);

      // 6. Update Linear issue with PR link
      await this.updateLinearIssue(issue.id, prUrl);

      console.log(`✅ Automation complete!`);
      console.log(`📦 PR created: ${prUrl}`);
    } catch (error) {
      console.error(`❌ Error processing issue ${issueId}:`, error);
      throw error;
    }
  }

  /**
   * Fetch issue details from Linear
   */
  private async getLinearIssue(issueId: string): Promise<any> {
    const issue = await this.linear.issue(issueId);
    return issue;
  }

  /**
   * Create a new git branch
   */
  private async createBranch(branchName: string): Promise<void> {
    console.log(`🌿 Creating branch: ${branchName}`);

    // Switch to main branch
    await execAsync(`cd ${this.repoPath} && git checkout main`, {
      cwd: this.repoPath,
    });

    // Pull latest changes
    await execAsync(`cd ${this.repoPath} && git pull origin main`, {
      cwd: this.repoPath,
    });

    // Check if branch already exists
    try {
      const { stdout } = await execAsync(
        `cd ${this.repoPath} && git rev-parse --verify ${branchName}`,
        { cwd: this.repoPath }
      );

      // Branch exists - delete it and recreate
      console.log(`⚠️  Branch ${branchName} already exists, recreating...`);

      // Delete local branch
      await execAsync(`cd ${this.repoPath} && git branch -D ${branchName}`, {
        cwd: this.repoPath,
      });

      // Try to delete remote branch (ignore errors if it doesn't exist remotely)
      try {
        await execAsync(`cd ${this.repoPath} && git push origin --delete ${branchName}`, {
          cwd: this.repoPath,
        });
      } catch (e) {
        // Ignore - remote branch might not exist
      }
    } catch (e) {
      // Branch doesn't exist - this is fine
    }

    // Create new branch
    await execAsync(`cd ${this.repoPath} && git checkout -b ${branchName}`, {
      cwd: this.repoPath,
    });
  }

  /**
   * Use Claude API to implement the issue
   */
  private async implementWithClaude(issue: any): Promise<any> {
    console.log(`🤖 Claude is implementing the solution...`);

    const prompt = this.buildImplementationPrompt(issue);

    const message = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Parse Claude's response to extract implementation details
    const response = message.content[0];
    const implementation = {
      filesChanged: this.extractFilesFromResponse(response),
      summary: this.extractSummaryFromResponse(response),
      testingNotes: this.extractTestingNotesFromResponse(response),
    };

    console.log(`📝 Implementation summary: ${implementation.summary}`);
    console.log(`📁 Files changed: ${implementation.filesChanged.length}`);

    return implementation;
  }

  /**
   * Build the prompt for Claude to implement the issue
   */
  private buildImplementationPrompt(issue: any): string {
    return `You are an expert iOS Swift developer working on the AWS Exam Helper app.

I need you to implement the following Linear issue:

**Issue ID:** ${issue.identifier}
**Title:** ${issue.title}
**Priority:** ${issue.priority}
**Description:**
${issue.description}

**Files mentioned:** ${this.extractFilePaths(issue.description).join(', ') || 'Not specified'}

**Acceptance Criteria:**
${this.extractAcceptanceCriteria(issue.description)}

Please provide a complete implementation plan including:

1. **Implementation Summary** - Brief overview of changes
2. **Files to Modify** - List all files that need changes with specific line numbers
3. **Code Changes** - Exact code modifications needed
4. **Testing Notes** - How to test the implementation

Important guidelines:
- Follow Swift and SwiftUI best practices
- Maintain consistency with existing code style
- Consider security implications
- Add appropriate error handling
- Write clear, maintainable code

Format your response as follows:
## Implementation Summary
[Brief summary]

## Files Changed
- File1.swift: [what changes]
- File2.swift: [what changes]

## Implementation Details
[Detailed implementation steps]

## Testing Notes
[How to test]
`;
  }

  /**
   * Commit changes and push to remote
   */
  private async commitAndPush(branchName: string, issue: any, implementation: any): Promise<void> {
    console.log(`💾 Committing and pushing changes...`);

    // Check if there are any changes to commit
    const { stdout: statusOutput } = await execAsync(`cd ${this.repoPath} && git status --porcelain`, {
      cwd: this.repoPath,
    });

    if (!statusOutput.trim()) {
      console.log(`⚠️  No changes to commit - Claude didn't modify any files yet`);
      console.log(`💡 This automation currently generates implementation plans, not actual code`);
      return;
    }

    const commitMessage = `feat: ${issue.title} (${issue.identifier})

${implementation.summary}

Fixes ${issue.identifier}

🤖 Generated with Claude API Automation
`;

    // Escape the commit message properly for shell
    const escapedMessage = commitMessage
      .replace(/`/g, '\\`')  // Escape backticks
      .replace(/"/g, '\\"')  // Escape double quotes
      .replace(/\$/g, '\\$') // Escape dollar signs
      .replace(/!/g, '\\!'); // Escape exclamation marks

    await execAsync(`cd ${this.repoPath} && git add .`, {
      cwd: this.repoPath,
    });

    await execAsync(`cd ${this.repoPath} && git commit -m "${escapedMessage}"`, {
      cwd: this.repoPath,
    });

    await execAsync(`cd ${this.repoPath} && git push -u origin ${branchName}`, {
      cwd: this.repoPath,
    });
  }

  /**
   * Create a Pull Request on GitHub
   */
  private async createPullRequest(branchName: string, issue: any, implementation: any): Promise<string> {
    console.log(`📤 Creating pull request...`);

    const pr = await this.octokit.pulls.create({
      owner: process.env.GITHUB_OWNER!,
      repo: process.env.GITHUB_REPO!,
      title: `${issue.title} (${issue.identifier})`,
      head: branchName,
      base: 'main',
      body: `## Summary

Fixes **${issue.identifier}: ${issue.title}**

${implementation.summary}

## Files Changed

${implementation.filesChanged.map((f: string) => `- ${f}`).join('\n')}

## Testing Notes

${implementation.testingNotes}

---

🤖 Automatically generated by Claude API Automation
📋 Linear Issue: ${issue.url}
`,
    });

    return pr.data.html_url;
  }

  /**
   * Update Linear issue with PR link
   */
  private async updateLinearIssue(issueId: string, prUrl: string): Promise<void> {
    console.log(`🔗 Updating Linear issue with PR link...`);

    await this.linear.updateIssue(issueId, {
      description: `${prUrl}\n\n---\n\nOriginal description...`,
    });
  }

  // Helper methods
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }

  private extractFilePaths(description: string): string[] {
    const matches = description.match(/`([^`]+\.(swift|graphql|json))`/gi) || [];
    return matches.map(m => m.replace(/`/g, ''));
  }

  private extractAcceptanceCriteria(description: string): string {
    const match = description.match(/## Acceptance Criteria([\s\S]*?)(?=##|$)/i);
    return match ? match[1].trim() : 'Not specified';
  }

  private extractFilesFromResponse(response: any): string[] {
    const text = typeof response === 'string' ? response : response.text;
    const matches = text.match(/- ([^\n:]+\.(swift|graphql|json)):/gi) || [];
    return matches.map((m: string) => m.replace(/^- /, '').replace(/:$/, ''));
  }

  private extractSummaryFromResponse(response: any): string {
    const text = typeof response === 'string' ? response : response.text;
    const match = text.match(/## Implementation Summary\s+([\s\S]*?)(?=##|$)/i);
    return match ? match[1].trim() : 'Implementation completed';
  }

  private extractTestingNotesFromResponse(response: any): string {
    const text = typeof response === 'string' ? response : response.text;
    const match = text.match(/## Testing Notes\s+([\s\S]*?)(?=##|$)/i);
    return match ? match[1].trim() : 'Manual testing required';
  }
}

import { LinearClient } from '@linear/sdk';
import { Octokit } from '@octokit/rest';
import { GitHubFileOperations } from './github-file-operations';
import { CloudCodeGenerator } from './cloud-code-generator';

/**
 * Cloud-Native Automation V3
 * No local repository needed - all operations via GitHub API
 */
export class ClaudeAutomationV3 {
  private linear: LinearClient;
  private octokit: Octokit;
  private github: GitHubFileOperations;
  private codeGenerator: CloudCodeGenerator;
  private owner: string;
  private repo: string;

  constructor() {
    this.linear = new LinearClient({
      apiKey: process.env.LINEAR_API_KEY!,
    });

    this.octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN,
    });

    this.owner = process.env.GITHUB_OWNER!;
    this.repo = process.env.GITHUB_REPO!;

    this.github = new GitHubFileOperations(
      process.env.GITHUB_TOKEN!,
      this.owner,
      this.repo
    );

    this.codeGenerator = new CloudCodeGenerator(
      process.env.ANTHROPIC_API_KEY!,
      this.github
    );
  }

  /**
   * Main entry point - full cloud-native autonomous implementation
   */
  async processIssue(issueId: string): Promise<void> {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`☁️  CLOUD-NATIVE AUTONOMOUS IMPLEMENTATION`);
    console.log(`📋 Issue: ${issueId}`);
    console.log(`${'='.repeat(80)}\n`);

    try {
      // 1. Fetch issue from Linear
      const issue = await this.getLinearIssue(issueId);
      if (!issue) {
        throw new Error(`Issue ${issueId} not found`);
      }

      await this.logIssueDetails(issue);

      // 2. Create branch via GitHub API
      const branchName = issue.branchName || `${issueId.toLowerCase()}-${this.slugify(issue.title)}`;
      await this.github.createBranch(branchName, 'main');

      // 3. Generate implementation (reads from GitHub, not local)
      const implementation = await this.codeGenerator.generateImplementation(issue);

      if (implementation.files.length === 0) {
        throw new Error('No files generated');
      }

      // 4. Commit files directly to GitHub
      await this.commitToGitHub(branchName, issue, implementation);

      // 5. Create Pull Request
      const prUrl = await this.createPullRequest(branchName, issue, implementation);

      // 6. Update Linear issue
      await this.updateLinearIssue(issue.id, prUrl);

      console.log(`\n${'='.repeat(80)}`);
      console.log(`✅ CLOUD-NATIVE IMPLEMENTATION COMPLETE`);
      console.log(`📦 Pull Request: ${prUrl}`);
      console.log(`${'='.repeat(80)}\n`);
    } catch (error) {
      console.error(`\n❌ Cloud automation failed for ${issueId}:`, error);
      throw error;
    }
  }

  /**
   * Log issue details
   */
  private async logIssueDetails(issue: any): Promise<void> {
    console.log(`📋 Title: ${issue.title}`);

    const labels = await issue.labels();
    const labelNames = labels?.nodes?.map((l: any) => l.name).join(', ') || 'No labels';
    console.log(`🏷️  Labels: ${labelNames}`);

    console.log(`⚠️  Priority: ${issue.priority || 'Not set'}`);
    console.log(`🔗 URL: ${issue.url}`);
    console.log();
  }

  /**
   * Fetch issue from Linear
   */
  private async getLinearIssue(issueId: string): Promise<any> {
    return await this.linear.issue(issueId);
  }

  /**
   * Commit files directly to GitHub (no local disk)
   */
  private async commitToGitHub(branchName: string, issue: any, implementation: any): Promise<void> {
    console.log(`\n💾 Committing ${implementation.files.length} files to GitHub...`);

    const commitMessage = `feat: ${issue.title} (${issue.identifier})

${implementation.summary}

Fixes ${issue.identifier}

🤖 Cloud-native automated implementation by Claude AI
`;

    await this.github.commitFiles(branchName, implementation.files, commitMessage);

    console.log(`✅ Files committed to ${branchName}`);
  }

  /**
   * Create Pull Request
   */
  private async createPullRequest(branchName: string, issue: any, implementation: any): Promise<string> {
    console.log(`\n📝 Creating Pull Request...`);

    const filesChanged = implementation.files.map((f: any) => `- ${f.path}`).join('\n');

    const body = `## Summary

Fixes **${issue.identifier}: ${issue.title}**

${implementation.summary}

## Files Changed

${filesChanged}

## Testing Notes

${implementation.testingNotes}

---

☁️ Cloud-native automated implementation by Claude AI
📋 Linear Issue: ${issue.url}
`;

    const pr = await this.octokit.pulls.create({
      owner: this.owner,
      repo: this.repo,
      title: `${issue.title} (${issue.identifier})`,
      head: branchName,
      base: 'main',
      body,
    });

    console.log(`✅ PR created: ${pr.data.html_url}`);
    return pr.data.html_url;
  }

  /**
   * Update Linear issue with PR link
   */
  private async updateLinearIssue(issueId: string, prUrl: string): Promise<void> {
    console.log(`\n🔗 Updating Linear issue...`);
    console.log(`✅ Linear issue ready for PR link: ${prUrl}`);
    // Could add comment or update description with PR link
  }

  /**
   * Slugify text for branch names
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }
}

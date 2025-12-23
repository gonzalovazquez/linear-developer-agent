import Anthropic from '@anthropic-ai/sdk';
import { LinearClient } from '@linear/sdk';
import { Octokit } from '@octokit/rest';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CodeGenerator } from './code-generator';
import { FileOperations } from './file-operations';
import { Validator } from './validator';

const execAsync = promisify(exec);

export class ClaudeAutomationV2 {
  private anthropic: Anthropic;
  private linear: LinearClient;
  private octokit: Octokit;
  private repoPath: string;
  private codeGenerator: CodeGenerator;
  private fileOps: FileOperations;
  private validator: Validator;

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

    this.codeGenerator = new CodeGenerator(process.env.ANTHROPIC_API_KEY!, this.repoPath);
    this.fileOps = new FileOperations(this.repoPath);
    this.validator = new Validator(this.repoPath);
  }

  /**
   * Main entry point - full autonomous implementation
   */
  async processIssue(issueId: string): Promise<void> {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🚀 AUTONOMOUS IMPLEMENTATION STARTED`);
    console.log(`📋 Issue: ${issueId}`);
    console.log(`${'='.repeat(80)}\n`);

    try {
      // 1. Fetch issue from Linear
      const issue = await this.getLinearIssue(issueId);
      if (!issue) {
        throw new Error(`Issue ${issueId} not found`);
      }

      await this.logIssueDetails(issue);

      // 2. Create git branch
      const branchName = issue.branchName || `${issueId.toLowerCase()}-${this.slugify(issue.title)}`;
      await this.createBranch(branchName);

      // 3. Generate implementation (with iterative refinement)
      const implementation = await this.implementWithValidation(issue);

      if (!implementation.success) {
        throw new Error(`Failed to implement after ${implementation.attempts} attempts`);
      }

      // 4. Commit changes
      await this.commitChanges(branchName, issue, implementation);

      // 5. Push to remote
      await this.pushBranch(branchName);

      // 6. Create Pull Request
      const prUrl = await this.createPullRequest(branchName, issue, implementation);

      // 7. Update Linear issue
      await this.updateLinearIssue(issue.id, prUrl);

      console.log(`\n${'='.repeat(80)}`);
      console.log(`✅ AUTONOMOUS IMPLEMENTATION COMPLETE`);
      console.log(`📦 Pull Request: ${prUrl}`);
      console.log(`${'='.repeat(80)}\n`);
    } catch (error) {
      console.error(`\n❌ Automation failed for ${issueId}:`, error);
      throw error;
    }
  }

  /**
   * Implement with validation and iterative refinement
   */
  private async implementWithValidation(issue: any, maxAttempts = 3): Promise<any> {
    const canBuild = await this.validator.isXcodebuildAvailable();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`🔄 Implementation Attempt ${attempt}/${maxAttempts}`);
      console.log(`${'─'.repeat(80)}\n`);

      // Generate code
      const result = await this.codeGenerator.generateImplementation(issue);

      if (result.changes.length === 0) {
        console.log(`⚠️  No file changes generated`);
        if (attempt === maxAttempts) {
          return { success: false, attempts: attempt, result };
        }
        continue;
      }

      // Apply changes
      await this.fileOps.applyChanges(result.changes);

      // Validate if xcodebuild is available
      if (!canBuild) {
        console.log(`⚠️  xcodebuild not available - skipping validation`);
        console.log(`✅ Accepting implementation without build validation`);
        return {
          success: true,
          attempts: attempt,
          result,
        };
      }

      // Run build validation
      const validation = await this.validator.validateBuild();

      if (validation.success) {
        console.log(`\n✅ Build validation passed on attempt ${attempt}!`);
        if (validation.warnings.length > 0) {
          console.log(`⚠️  Warnings: ${validation.warnings.length}`);
          validation.warnings.slice(0, 3).forEach(w => console.log(`   - ${w}`));
        }
        return {
          success: true,
          attempts: attempt,
          result,
          validation,
        };
      }

      // Build failed - try to fix
      console.log(`\n❌ Build failed on attempt ${attempt}`);
      console.log(`📝 Errors found: ${validation.errors.length}`);
      validation.errors.slice(0, 5).forEach(e => console.log(`   - ${e}`));

      if (attempt < maxAttempts) {
        console.log(`\n🔧 Asking Claude to fix errors...`);
        // Add errors to issue context for next attempt
        issue.buildErrors = validation.errors;
        issue.previousAttempt = result;
      } else {
        console.log(`\n⚠️  Max attempts reached - accepting with build errors`);
        return {
          success: false,
          attempts: attempt,
          result,
          validation,
        };
      }
    }

    throw new Error('Implementation failed after max attempts');
  }

  /**
   * Log issue details nicely
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
   * Create git branch
   */
  private async createBranch(branchName: string): Promise<void> {
    console.log(`🌿 Creating branch: ${branchName}\n`);

    await execAsync(`cd ${this.repoPath} && git checkout main`, { cwd: this.repoPath });
    await execAsync(`cd ${this.repoPath} && git pull origin main`, { cwd: this.repoPath });

    try {
      await execAsync(`cd ${this.repoPath} && git rev-parse --verify ${branchName}`, {
        cwd: this.repoPath,
      });

      console.log(`⚠️  Branch exists - deleting and recreating`);
      await execAsync(`cd ${this.repoPath} && git branch -D ${branchName}`, { cwd: this.repoPath });

      try {
        await execAsync(`cd ${this.repoPath} && git push origin --delete ${branchName}`, {
          cwd: this.repoPath,
        });
      } catch (e) {
        // Ignore - remote might not exist
      }
    } catch (e) {
      // Branch doesn't exist - this is fine
    }

    await execAsync(`cd ${this.repoPath} && git checkout -b ${branchName}`, { cwd: this.repoPath });
  }

  /**
   * Commit changes
   */
  private async commitChanges(branchName: string, issue: any, implementation: any): Promise<void> {
    console.log(`\n💾 Committing changes...`);

    const { stdout: statusOutput } = await execAsync(`cd ${this.repoPath} && git status --porcelain`, {
      cwd: this.repoPath,
    });

    if (!statusOutput.trim()) {
      console.log(`⚠️  No changes to commit`);
      return;
    }

    const commitMessage = `feat: ${issue.title} (${issue.identifier})

${implementation.result.summary}

Implementation completed in ${implementation.attempts} attempt(s).
${implementation.validation?.warnings?.length > 0 ? `Build warnings: ${implementation.validation.warnings.length}` : ''}

Fixes ${issue.identifier}

🤖 Automated implementation by Claude AI
`;

    const escapedMessage = commitMessage
      .replace(/`/g, '\\`')
      .replace(/"/g, '\\"')
      .replace(/\$/g, '\\$');

    await execAsync(`cd ${this.repoPath} && git add .`, { cwd: this.repoPath });
    await execAsync(`cd ${this.repoPath} && git commit -m "${escapedMessage}"`, {
      cwd: this.repoPath,
    });

    console.log(`✅ Changes committed`);
  }

  /**
   * Push branch to remote
   */
  private async pushBranch(branchName: string): Promise<void> {
    console.log(`\n📤 Pushing to remote...`);

    await execAsync(`cd ${this.repoPath} && git push -u origin ${branchName}`, {
      cwd: this.repoPath,
    });

    console.log(`✅ Pushed to origin/${branchName}`);
  }

  /**
   * Create Pull Request
   */
  private async createPullRequest(branchName: string, issue: any, implementation: any): Promise<string> {
    console.log(`\n📝 Creating Pull Request...`);

    const filesChanged = implementation.result.changes.map((c: any) => `- ${c.filePath}`).join('\n');

    const body = `## Summary

Fixes **${issue.identifier}: ${issue.title}**

${implementation.result.summary}

## Implementation Details

${filesChanged}

## Validation

- ✅ Implementation completed in ${implementation.attempts} attempt(s)
${implementation.validation?.success ? '- ✅ Build validation passed' : '- ⚠️  Build validation skipped or failed'}
${implementation.validation?.warnings?.length > 0 ? `- ⚠️  ${implementation.validation.warnings.length} build warnings` : ''}

## Testing Notes

${implementation.result.testingNotes}

---

🤖 Automated implementation by Claude AI
📋 Linear Issue: ${issue.url}
`;

    const pr = await this.octokit.pulls.create({
      owner: process.env.GITHUB_OWNER!,
      repo: process.env.GITHUB_REPO!,
      title: `${issue.title} (${issue.identifier})`,
      head: branchName,
      base: 'main',
      body,
    });

    console.log(`✅ PR created: ${pr.data.html_url}`);
    return pr.data.html_url;
  }

  /**
   * Update Linear issue
   */
  private async updateLinearIssue(issueId: string, prUrl: string): Promise<void> {
    console.log(`\n🔗 Updating Linear issue...`);

    // Could add PR link to issue description or add a comment
    // For now, just log
    console.log(`✅ Linear issue ready for PR link: ${prUrl}`);
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

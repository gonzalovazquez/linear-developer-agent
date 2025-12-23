import { Octokit } from '@octokit/rest';

export interface GitHubFile {
  path: string;
  content: string;
  sha?: string; // For updating existing files
}

export class GitHubFileOperations {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(token: string, owner: string, repo: string) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Read a file from GitHub repository
   */
  async readFile(path: string, branch = 'main'): Promise<{ content: string; sha: string }> {
    try {
      const response = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: branch,
      });

      if ('content' in response.data) {
        const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
        console.log(`📖 Read file from GitHub: ${path} (${content.length} chars)`);
        return {
          content,
          sha: response.data.sha,
        };
      }

      throw new Error(`${path} is not a file`);
    } catch (error: any) {
      if (error.status === 404) {
        console.log(`📝 File not found: ${path} (will create new)`);
        return { content: '', sha: '' };
      }
      throw error;
    }
  }

  /**
   * Read multiple files in parallel
   */
  async readFiles(paths: string[], branch = 'main'): Promise<Map<string, string>> {
    const files = new Map<string, string>();

    const results = await Promise.allSettled(
      paths.map(path => this.readFile(path, branch))
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        files.set(paths[index], result.value.content);
      } else {
        console.log(`⚠️  Could not read ${paths[index]}: ${result.reason}`);
      }
    });

    return files;
  }

  /**
   * Create a new branch from base branch
   */
  async createBranch(branchName: string, baseBranch = 'main'): Promise<void> {
    try {
      // Get the SHA of the base branch
      const { data: ref } = await this.octokit.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${baseBranch}`,
      });

      // Create new branch
      await this.octokit.git.createRef({
        owner: this.owner,
        repo: this.repo,
        ref: `refs/heads/${branchName}`,
        sha: ref.object.sha,
      });

      console.log(`🌿 Created branch: ${branchName} from ${baseBranch}`);
    } catch (error: any) {
      if (error.status === 422) {
        // Branch already exists - delete and recreate
        console.log(`⚠️  Branch ${branchName} exists, deleting and recreating...`);
        await this.deleteBranch(branchName);
        await this.createBranch(branchName, baseBranch);
      } else {
        throw error;
      }
    }
  }

  /**
   * Delete a branch
   */
  async deleteBranch(branchName: string): Promise<void> {
    try {
      await this.octokit.git.deleteRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${branchName}`,
      });
      console.log(`🗑️  Deleted branch: ${branchName}`);
    } catch (error: any) {
      if (error.status !== 404) {
        throw error;
      }
    }
  }

  /**
   * Create or update multiple files in a single commit
   */
  async commitFiles(
    branchName: string,
    files: GitHubFile[],
    commitMessage: string
  ): Promise<void> {
    console.log(`💾 Committing ${files.length} files to ${branchName}...`);

    // Get the current commit SHA
    const { data: ref } = await this.octokit.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${branchName}`,
    });

    const currentCommitSha = ref.object.sha;

    // Get the current tree
    const { data: commit } = await this.octokit.git.getCommit({
      owner: this.owner,
      repo: this.repo,
      commit_sha: currentCommitSha,
    });

    const currentTreeSha = commit.tree.sha;

    // Create blobs for all files (sequentially to avoid issues)
    const tree = [];
    for (const file of files) {
      try {
        console.log(`📦 Creating blob for: ${file.path}`);

        const { data: blob } = await this.octokit.git.createBlob({
          owner: this.owner,
          repo: this.repo,
          content: Buffer.from(file.content, 'utf-8').toString('base64'),
          encoding: 'base64',
        });

        console.log(`✅ Blob created: ${file.path} -> ${blob.sha}`);

        tree.push({
          path: file.path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blob.sha,
        });
      } catch (error) {
        console.error(`❌ Failed to create blob for ${file.path}:`, error);
        throw error;
      }
    }

    // Create new tree
    const { data: newTree } = await this.octokit.git.createTree({
      owner: this.owner,
      repo: this.repo,
      base_tree: currentTreeSha,
      tree,
    });

    // Create new commit
    const { data: newCommit } = await this.octokit.git.createCommit({
      owner: this.owner,
      repo: this.repo,
      message: commitMessage,
      tree: newTree.sha,
      parents: [currentCommitSha],
    });

    // Update branch reference
    await this.octokit.git.updateRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${branchName}`,
      sha: newCommit.sha,
    });

    console.log(`✅ Committed ${files.length} files`);
  }

  /**
   * Search for files in repository
   */
  async searchFiles(query: string, extension = 'swift'): Promise<string[]> {
    try {
      const { data } = await this.octokit.search.code({
        q: `${query} extension:${extension} repo:${this.owner}/${this.repo}`,
      });

      return data.items.map(item => item.path).slice(0, 10);
    } catch (error) {
      console.log(`⚠️  Search failed: ${error}`);
      return [];
    }
  }

  /**
   * List Swift files in repository
   */
  async listSwiftFiles(): Promise<string[]> {
    try {
      const { data } = await this.octokit.git.getTree({
        owner: this.owner,
        repo: this.repo,
        tree_sha: 'main',
        recursive: 'true',
      });

      return data.tree
        .filter(item => item.path?.endsWith('.swift'))
        .map(item => item.path!)
        .slice(0, 50); // Limit to 50 files
    } catch (error) {
      console.log(`⚠️  Failed to list files: ${error}`);
      return [];
    }
  }

  /**
   * Extract file paths from issue description
   */
  extractFilePaths(description: string): string[] {
    const patterns = [
      /`([^`]+\.(swift|graphql|json|md|txt|sh))`/gi,
      /\*\*Files?\*\*:?\s*([^\n]+)/gi,
      /Files?:\s*([^\n]+)/gi,
    ];

    const filePaths = new Set<string>();

    for (const pattern of patterns) {
      const matches = description.matchAll(pattern);
      for (const match of matches) {
        const text = match[1];
        const paths = text.split(/[,\n]/).map(p =>
          p.trim()
            // Remove markdown formatting
            .replace(/^\*\*|\*\*$/g, '')  // Remove bold
            .replace(/^`|`$/g, '')         // Remove backticks
            .replace(/^[*_-]\s*/g, '')     // Remove list markers
            .replace(/:\d+(-\d+)?$/, '')   // Remove line numbers
            .trim()
        );
        paths.forEach(p => {
          if (p && (
            p.endsWith('.swift') ||
            p.endsWith('.graphql') ||
            p.endsWith('.json') ||
            p.endsWith('.md') ||
            p.endsWith('.sh') ||
            p.endsWith('.txt')
          )) {
            // Final cleanup - remove any remaining special chars at start
            const cleaned = p.replace(/^[^a-zA-Z0-9./_-]+/, '');
            if (cleaned) {
              filePaths.add(cleaned);
            }
          }
        });
      }
    }

    return Array.from(filePaths);
  }
}

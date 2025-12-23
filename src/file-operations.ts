import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface FileChange {
  filePath: string;
  action: 'create' | 'modify' | 'delete';
  content?: string;
  originalContent?: string;
}

export class FileOperations {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  /**
   * Read a file from the repository
   */
  async readFile(filePath: string): Promise<string> {
    const fullPath = path.join(this.repoPath, filePath);
    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      console.log(`📖 Read file: ${filePath} (${content.length} chars)`);
      return content;
    } catch (error) {
      console.error(`❌ Error reading file ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Write a file to the repository
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.repoPath, filePath);

    // Ensure directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(fullPath, content, 'utf-8');
    console.log(`✏️  Wrote file: ${filePath} (${content.length} chars)`);
  }

  /**
   * Check if a file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    const fullPath = path.join(this.repoPath, filePath);
    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete a file
   */
  async deleteFile(filePath: string): Promise<void> {
    const fullPath = path.join(this.repoPath, filePath);
    await fs.unlink(fullPath);
    console.log(`🗑️  Deleted file: ${filePath}`);
  }

  /**
   * Apply multiple file changes
   */
  async applyChanges(changes: FileChange[]): Promise<void> {
    console.log(`📝 Applying ${changes.length} file changes...`);

    for (const change of changes) {
      switch (change.action) {
        case 'create':
        case 'modify':
          if (change.content) {
            await this.writeFile(change.filePath, change.content);
          }
          break;
        case 'delete':
          await this.deleteFile(change.filePath);
          break;
      }
    }

    console.log(`✅ Applied all file changes`);
  }

  /**
   * Extract file paths mentioned in issue description
   */
  extractFilePaths(description: string): string[] {
    // Match patterns like:
    // - `path/to/file.swift`
    // - **Files:** path/to/file.swift
    // - File: path/to/file.swift:123
    const patterns = [
      /`([^`]+\.(swift|graphql|json|md|txt))`/gi,
      /\*\*Files?\*\*:?\s*([^\n]+)/gi,
      /Files?:\s*([^\n]+)/gi,
    ];

    const filePaths = new Set<string>();

    for (const pattern of patterns) {
      const matches = description.matchAll(pattern);
      for (const match of matches) {
        const text = match[1];
        // Split by commas and clean up
        const paths = text.split(/[,\n]/).map(p =>
          p.trim()
            .replace(/^`|`$/g, '')
            .replace(/:\d+(-\d+)?$/, '') // Remove line numbers
            .trim()
        );
        paths.forEach(p => {
          if (p && (p.endsWith('.swift') || p.endsWith('.graphql') || p.endsWith('.json'))) {
            filePaths.add(p);
          }
        });
      }
    }

    return Array.from(filePaths);
  }

  /**
   * Find Swift files that might need modification based on issue context
   */
  async findRelevantFiles(keywords: string[]): Promise<string[]> {
    const searchPattern = keywords.map(k => `-e "${k}"`).join(' ');

    try {
      const { stdout } = await execAsync(
        `cd ${this.repoPath} && git ls-files "*.swift" | head -50`,
        { cwd: this.repoPath }
      );

      const allFiles = stdout.split('\n').filter(f => f.trim());

      // If no keywords, return main Swift files
      if (keywords.length === 0) {
        return allFiles.slice(0, 10);
      }

      // Search for keywords in files
      const relevantFiles: string[] = [];

      for (const file of allFiles.slice(0, 30)) { // Limit search
        try {
          const { stdout: grepOut } = await execAsync(
            `cd ${this.repoPath} && grep -l ${searchPattern} "${file}" || true`,
            { cwd: this.repoPath }
          );

          if (grepOut.trim()) {
            relevantFiles.push(file);
          }
        } catch (e) {
          // File doesn't contain keywords - skip
        }
      }

      return relevantFiles.slice(0, 5); // Return top 5 matches
    } catch (error) {
      console.error('Error finding relevant files:', error);
      return [];
    }
  }

  /**
   * Get git diff for modified files
   */
  async getDiff(): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `cd ${this.repoPath} && git diff HEAD`,
        { cwd: this.repoPath }
      );
      return stdout;
    } catch (error) {
      return '';
    }
  }
}

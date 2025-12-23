import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  output: string;
}

export class Validator {
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  /**
   * Run Swift build to check for compilation errors
   */
  async validateBuild(): Promise<ValidationResult> {
    console.log(`🔨 Running Swift build validation...`);

    try {
      const { stdout, stderr } = await execAsync(
        `cd ${this.repoPath} && xcodebuild -project AWSExamHelper.xcodeproj -scheme AWSExamHelper -destination 'platform=iOS Simulator,name=iPhone 15' build -quiet`,
        {
          cwd: this.repoPath,
          timeout: 120000, // 2 minutes
        }
      );

      const output = stdout + '\n' + stderr;

      // Check for build success
      if (output.includes('BUILD SUCCEEDED')) {
        console.log(`✅ Build succeeded`);
        return {
          success: true,
          errors: [],
          warnings: this.extractWarnings(output),
          output,
        };
      } else {
        const errors = this.extractErrors(output);
        console.log(`❌ Build failed with ${errors.length} errors`);
        return {
          success: false,
          errors,
          warnings: this.extractWarnings(output),
          output,
        };
      }
    } catch (error: any) {
      const output = error.stdout + '\n' + error.stderr;
      const errors = this.extractErrors(output);

      console.log(`❌ Build command failed: ${errors.length} errors found`);

      return {
        success: false,
        errors: errors.length > 0 ? errors : [error.message],
        warnings: this.extractWarnings(output),
        output,
      };
    }
  }

  /**
   * Quick syntax validation without full build (faster)
   */
  async validateSyntax(filePath: string): Promise<ValidationResult> {
    console.log(`🔍 Validating syntax for: ${filePath}`);

    try {
      const { stdout, stderr } = await execAsync(
        `cd ${this.repoPath} && swiftc -syntax ${filePath} 2>&1 || true`,
        {
          cwd: this.repoPath,
          timeout: 30000,
        }
      );

      const output = stdout + stderr;
      const errors = this.extractErrors(output);

      if (errors.length === 0) {
        console.log(`✅ Syntax valid for ${filePath}`);
        return {
          success: true,
          errors: [],
          warnings: this.extractWarnings(output),
          output,
        };
      } else {
        console.log(`❌ Syntax errors in ${filePath}`);
        return {
          success: false,
          errors,
          warnings: [],
          output,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        errors: [error.message],
        warnings: [],
        output: error.message,
      };
    }
  }

  /**
   * Check if xcodebuild is available
   */
  async isXcodebuildAvailable(): Promise<boolean> {
    try {
      await execAsync('which xcodebuild', { cwd: this.repoPath });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract errors from build output
   */
  private extractErrors(output: string): string[] {
    const errors: string[] = [];

    // Match Xcode error format: file.swift:line:col: error: message
    const errorRegex = /([^:\n]+):(\d+):(\d+):\s*error:\s*(.+)/gi;

    let match: RegExpExecArray | null;
    while ((match = errorRegex.exec(output)) !== null) {
      const file = match[1];
      const line = match[2];
      const message = match[4];
      errors.push(`${file}:${line} - ${message}`);
    }

    // Also catch general error messages
    const generalErrorRegex = /\*\*\s*BUILD FAILED\s*\*\*|fatal error:\s*(.+)/gi;
    while ((match = generalErrorRegex.exec(output)) !== null) {
      const errorMsg = match[1] || match[0];
      if (errorMsg && !errors.some(e => e.includes(errorMsg))) {
        errors.push(errorMsg);
      }
    }

    return errors.slice(0, 10); // Limit to top 10 errors
  }

  /**
   * Extract warnings from build output
   */
  private extractWarnings(output: string): string[] {
    const warnings: string[] = [];

    const warningRegex = /([^:\n]+):(\d+):(\d+):\s*warning:\s*(.+)/gi;

    let match: RegExpExecArray | null;
    while ((match = warningRegex.exec(output)) !== null) {
      const file = match[1];
      const line = match[2];
      const message = match[4];
      warnings.push(`${file}:${line} - ${message}`);
    }

    return warnings.slice(0, 5); // Limit to top 5 warnings
  }

  /**
   * Format errors for Claude to fix
   */
  formatErrorsForFeedback(errors: string[]): string {
    if (errors.length === 0) {
      return 'No errors';
    }

    return `Build Errors:\n\n${errors.map((e, i) => `${i + 1}. ${e}`).join('\n')}`;
  }
}

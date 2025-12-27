import { Injectable, Logger } from '@nestjs/common';
import { execSync } from 'child_process';
import { NativeGeminiService } from '../../llm/native-gemini.service';
import { ChangelogJson } from '../entities/release-notification.entity';

/**
 * Raw git commit data.
 */
export interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  body: string;
  authorName: string;
  authorEmail: string;
  date: Date;
}

/**
 * Changelog item with title and optional description.
 */
export interface ChangelogItem {
  title: string;
  description?: string;
}

/**
 * Structured changelog from LLM.
 */
export interface StructuredChangelog {
  summary: string;
  features: ChangelogItem[];
  improvements: ChangelogItem[];
  bugFixes: ChangelogItem[];
  breakingChanges: ChangelogItem[];
}

/**
 * Options for changelog generation.
 */
export interface ChangelogOptions {
  /** Start commit (for commit range) */
  fromCommit?: string;
  /** End commit (for commit range, defaults to HEAD) */
  toCommit?: string;
  /** Branch name (defaults to 'main') */
  branch?: string;
  /** Date to get commits since (e.g., "2024-12-01", "1 week ago", "yesterday") */
  since?: string;
  /** Date to get commits until (defaults to now) */
  until?: string;
  /** Skip LLM processing, use raw commit messages */
  rawCommits?: boolean;
  /** Trace ID for observability */
  traceId?: string;
}

/**
 * Result of changelog generation.
 */
export interface ChangelogResult {
  version: string;
  fromCommit: string;
  toCommit: string;
  commitCount: number;
  commits: GitCommit[];
  changelog: StructuredChangelog;
  changelogJson: ChangelogJson;
}

/**
 * Service for generating release changelogs from git commits using LLM.
 *
 * This service:
 * 1. Fetches git commits between two refs
 * 2. Uses an LLM to categorize and summarize changes
 * 3. Returns a structured changelog for email templates
 */
@Injectable()
export class ReleaseChangelogService {
  private readonly logger = new Logger(ReleaseChangelogService.name);
  private readonly gitDir: string;

  constructor(private readonly geminiService: NativeGeminiService) {
    // Assume we're running from the repository root
    this.gitDir = process.cwd();
  }

  /**
   * Generate a version string based on current date.
   * Format: v{YYYY}.{MM}.{DD}[.{N}]
   */
  generateVersion(existingVersionsToday: number = 0): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    if (existingVersionsToday > 0) {
      return `v${year}.${month}.${day}.${existingVersionsToday + 1}`;
    }
    return `v${year}.${month}.${day}`;
  }

  /**
   * Get the current HEAD commit hash.
   */
  getCurrentCommit(): string {
    try {
      return execSync('git rev-parse HEAD', {
        cwd: this.gitDir,
        encoding: 'utf-8',
      }).trim();
    } catch (error) {
      this.logger.error('Failed to get current commit', error);
      throw new Error('Failed to get current git commit');
    }
  }

  /**
   * Get commits between two refs.
   */
  getCommitsBetween(fromCommit: string, toCommit: string): GitCommit[] {
    try {
      // Use %x00 as delimiter for safer parsing
      const format =
        '%H%x00%h%x00%s%x00%b%x00%an%x00%ae%x00%aI%x00END_COMMIT%x00';
      const range = `${fromCommit}..${toCommit}`;

      const output = execSync(`git log --format="${format}" ${range}`, {
        cwd: this.gitDir,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large histories
      });

      if (!output.trim()) {
        return [];
      }

      const commits: GitCommit[] = [];
      const commitStrings = output
        .split('END_COMMIT\0')
        .filter((s) => s.trim());

      for (const commitStr of commitStrings) {
        const parts = commitStr.split('\0');
        if (parts.length >= 7) {
          commits.push({
            hash: parts[0].trim(),
            shortHash: parts[1].trim(),
            subject: parts[2].trim(),
            body: parts[3].trim(),
            authorName: parts[4].trim(),
            authorEmail: parts[5].trim(),
            date: new Date(parts[6].trim()),
          });
        }
      }

      return commits;
    } catch (error) {
      this.logger.error(
        `Failed to get commits between ${fromCommit} and ${toCommit}`,
        error
      );
      throw new Error('Failed to get git commits');
    }
  }

  /**
   * Get the most recent tag on the branch.
   */
  getLatestTag(branch: string = 'main'): string | null {
    try {
      const output = execSync(
        `git describe --tags --abbrev=0 ${branch} 2>/dev/null || echo ""`,
        {
          cwd: this.gitDir,
          encoding: 'utf-8',
        }
      ).trim();

      return output || null;
    } catch {
      return null;
    }
  }

  getCommitsSince(since: string, until?: string): GitCommit[] {
    try {
      const format =
        '%H%x00%h%x00%s%x00%b%x00%an%x00%ae%x00%aI%x00END_COMMIT%x00';
      let cmd = `git log --format="${format}" --since="${since}"`;
      if (until) {
        cmd += ` --until="${until}"`;
      }

      const output = execSync(cmd, {
        cwd: this.gitDir,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });

      if (!output.trim()) {
        return [];
      }

      const commits: GitCommit[] = [];
      const commitStrings = output
        .split('END_COMMIT\0')
        .filter((s) => s.trim());

      for (const commitStr of commitStrings) {
        const parts = commitStr.split('\0');
        if (parts.length >= 7) {
          commits.push({
            hash: parts[0].trim(),
            shortHash: parts[1].trim(),
            subject: parts[2].trim(),
            body: parts[3].trim(),
            authorName: parts[4].trim(),
            authorEmail: parts[5].trim(),
            date: new Date(parts[6].trim()),
          });
        }
      }

      return commits;
    } catch (error) {
      this.logger.error(`Failed to get commits since ${since}`, error);
      throw new Error('Failed to get git commits');
    }
  }

  /**
   * Generate a changelog from commits using LLM.
   */
  async generateChangelog(
    options: ChangelogOptions = {}
  ): Promise<ChangelogResult> {
    const {
      fromCommit,
      toCommit = 'HEAD',
      branch = 'main',
      since,
      until,
      rawCommits = false,
      traceId,
    } = options;

    let commits: GitCommit[];
    let startRef: string;
    let endRef: string;

    if (since) {
      this.logger.log(
        `Using date range: since "${since}"${until ? ` until "${until}"` : ''}`
      );
      commits = this.getCommitsSince(since, until);

      if (commits.length === 0) {
        this.logger.warn(`No commits found since ${since}`);
        return {
          version: this.generateVersion(),
          fromCommit: since,
          toCommit: until || 'now',
          commitCount: 0,
          commits: [],
          changelog: {
            summary: 'No changes in this release.',
            features: [],
            improvements: [],
            bugFixes: [],
            breakingChanges: [],
          },
          changelogJson: {
            features: [],
            fixes: [],
            improvements: [],
          },
        };
      }

      startRef = commits[commits.length - 1].shortHash;
      endRef = commits[0].shortHash;
    } else {
      let startCommit = fromCommit;
      if (!startCommit) {
        const latestTag = this.getLatestTag(branch);
        if (latestTag) {
          startCommit = latestTag;
          this.logger.log(`Using latest tag as start: ${latestTag}`);
        } else {
          startCommit = `${toCommit}~50`;
          this.logger.warn(
            'No tags found, using last 50 commits as changelog source'
          );
        }
      }

      const endCommit =
        toCommit === 'HEAD' ? this.getCurrentCommit() : toCommit;
      commits = this.getCommitsBetween(startCommit, endCommit);

      if (commits.length === 0) {
        this.logger.warn(
          `No commits found between ${startCommit} and ${endCommit}`
        );
        return {
          version: this.generateVersion(),
          fromCommit: startCommit.substring(0, 7),
          toCommit: endCommit.substring(0, 7),
          commitCount: 0,
          commits: [],
          changelog: {
            summary: 'No changes in this release.',
            features: [],
            improvements: [],
            bugFixes: [],
            breakingChanges: [],
          },
          changelogJson: {
            features: [],
            fixes: [],
            improvements: [],
          },
        };
      }

      startRef = startCommit.substring(0, 7);
      endRef = endCommit.substring(0, 7);
    }

    this.logger.log(`Found ${commits.length} commits (${startRef}..${endRef})`);

    this.logger.log(
      `Changelog generation mode: ${
        rawCommits ? 'RAW_COMMITS' : 'LLM_PROCESSED'
      }`
    );

    if (rawCommits) {
      return this.createRawChangelog(commits, startRef, endRef);
    }

    this.logger.log('Calling generateChangelogWithLLM...');
    const changelog = await this.generateChangelogWithLLM(commits, traceId);
    this.logger.log(
      `LLM changelog generated with ${changelog.features.length} features, ${changelog.improvements.length} improvements, ${changelog.bugFixes.length} fixes`
    );

    return {
      version: this.generateVersion(),
      fromCommit: startRef,
      toCommit: endRef,
      commitCount: commits.length,
      commits,
      changelog,
      changelogJson: this.toChangelogJson(changelog),
    };
  }

  /**
   * Create a raw changelog without LLM processing.
   */
  private createRawChangelog(
    commits: GitCommit[],
    fromCommit: string,
    toCommit: string
  ): ChangelogResult {
    // Simple categorization based on commit message prefixes
    const features: ChangelogItem[] = [];
    const improvements: ChangelogItem[] = [];
    const bugFixes: ChangelogItem[] = [];

    for (const commit of commits) {
      const subject = commit.subject.toLowerCase();
      const item: ChangelogItem = {
        title: commit.subject,
        description: commit.body || undefined,
      };

      if (
        subject.startsWith('feat') ||
        subject.startsWith('add') ||
        subject.includes('new feature')
      ) {
        features.push(item);
      } else if (
        subject.startsWith('fix') ||
        subject.startsWith('bug') ||
        subject.includes('bugfix')
      ) {
        bugFixes.push(item);
      } else {
        improvements.push(item);
      }
    }

    return {
      version: this.generateVersion(),
      fromCommit: fromCommit.substring(0, 7),
      toCommit: toCommit.substring(0, 7),
      commitCount: commits.length,
      commits,
      changelog: {
        summary: `This release includes ${commits.length} commits.`,
        features,
        improvements,
        bugFixes,
        breakingChanges: [],
      },
      changelogJson: {
        features: features.map((f) => f.title),
        fixes: bugFixes.map((f) => f.title),
        improvements: improvements.map((i) => i.title),
      },
    };
  }

  /**
   * Generate a structured changelog using LLM.
   */
  private async generateChangelogWithLLM(
    commits: GitCommit[],
    traceId?: string
  ): Promise<StructuredChangelog> {
    const isLLMAvailable = this.geminiService.isAvailable();
    this.logger.log(`LLM service available: ${isLLMAvailable}`);

    if (!isLLMAvailable) {
      this.logger.warn('LLM service not available, using raw changelog');
      return {
        summary: `This release includes ${commits.length} commits.`,
        features: commits.slice(0, 5).map((c) => ({ title: c.subject })),
        improvements: [],
        bugFixes: [],
        breakingChanges: [],
      };
    }

    // Format commits for the prompt
    const commitList = commits
      .map(
        (c) =>
          `- ${c.shortHash}: ${c.subject}${
            c.body ? `\n  ${c.body.substring(0, 200)}` : ''
          }`
      )
      .join('\n');

    const prompt = `You are writing release notes for "Emergent" - a knowledge management platform that helps users organize documents, extract insights, and chat with their knowledge base.

Your goal is to communicate VALUE to users: what can they now DO that they couldn't before? Focus on outcomes, not implementation.

## Git Commits:
${commitList}

## Writing Guidelines:
1. **Lead with user value**: Start each item with what the user can now accomplish
   - Bad: "Added export button to documents page"
   - Good: "Export your documents to PDF or Markdown for offline access"
2. **Use action-oriented language**: "You can now...", "Easily...", "Quickly..."
3. **Be specific about benefits**: Don't just say "improved" - say how it's better
   - Bad: "Improved search performance"
   - Good: "Find documents 3x faster with optimized search"
4. **Merge related commits**: Combine implementation details into single user-facing changes
5. **Skip internal changes**: Ignore refactors, dependency updates, and non-user-facing work
6. **For bug fixes**: Frame as restored/fixed capability, not technical issues
   - Bad: "Fixed null pointer exception in upload handler"
   - Good: "Document uploads now work reliably for all file types"

## Output Format:
Return a JSON object with this structure:
{
  "summary": "1-2 sentences highlighting the biggest value-add for users in this release",
  "features": [
    { "title": "Action-oriented title (what you can now do)", "description": "Brief explanation of the benefit" }
  ],
  "improvements": [
    { "title": "What's now better/faster/easier", "description": "How this helps you" }
  ],
  "bugFixes": [
    { "title": "What now works correctly", "description": "Optional context" }
  ],
  "breakingChanges": [
    { "title": "What changed", "description": "What you need to do to adapt" }
  ]
}

Return ONLY valid JSON, no markdown or explanation.`;

    try {
      this.logger.log(
        `Calling generateJsonFreeform with ${commits.length} commits...`
      );
      const result =
        await this.geminiService.generateJsonFreeform<StructuredChangelog>(
          prompt,
          {
            temperature: 0.3,
            maxOutputTokens: 4096,
          },
          traceId
            ? {
                traceId,
                generationName: 'generate_release_changelog',
              }
            : undefined
        );

      this.logger.log(
        `LLM result: success=${
          result.success
        }, hasData=${!!result.data}, error=${result.error || 'none'}`
      );

      if (result.success && result.data) {
        this.logger.log('LLM changelog generated successfully, validating...');
        return this.validateChangelog(result.data);
      }

      this.logger.warn(
        `LLM changelog generation failed (success=${result.success}, error=${result.error}), using raw format`
      );
      return {
        summary: `This release includes ${commits.length} commits.`,
        features: [],
        improvements: commits.slice(0, 10).map((c) => ({ title: c.subject })),
        bugFixes: [],
        breakingChanges: [],
      };
    } catch (error) {
      this.logger.error('Failed to generate changelog with LLM', error);
      return {
        summary: `This release includes ${commits.length} commits.`,
        features: [],
        improvements: commits.slice(0, 10).map((c) => ({ title: c.subject })),
        bugFixes: [],
        breakingChanges: [],
      };
    }
  }

  /**
   * Validate and normalize changelog structure.
   */
  private validateChangelog(data: any): StructuredChangelog {
    const ensureArray = (arr: any): ChangelogItem[] => {
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          title: String(item.title || item.name || '').trim(),
          description: item.description
            ? String(item.description).trim()
            : undefined,
        }))
        .filter((item) => item.title.length > 0);
    };

    return {
      summary: String(data.summary || 'Release update').trim(),
      features: ensureArray(data.features),
      improvements: ensureArray(data.improvements),
      bugFixes: ensureArray(data.bugFixes || data.fixes),
      breakingChanges: ensureArray(data.breakingChanges),
    };
  }

  /**
   * Convert structured changelog to simplified JSON format for database storage.
   */
  private toChangelogJson(changelog: StructuredChangelog): ChangelogJson {
    return {
      features: changelog.features.map((f) => f.title),
      fixes: changelog.bugFixes.map((f) => f.title),
      improvements: changelog.improvements.map((i) => i.title),
    };
  }
}

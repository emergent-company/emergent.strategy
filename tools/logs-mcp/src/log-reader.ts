/**
 * Log Reader Utilities
 *
 * Provides efficient file reading operations for log files.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

export interface LogFileInfo {
  name: string;
  path: string;
  size: number;
  sizeHuman: string;
  modifiedAt: Date;
  isDirectory: boolean;
}

export interface SearchMatch {
  file: string;
  line: number;
  content: string;
}

/**
 * Format bytes to human-readable size
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get the default logs directory
 */
export function getLogsDir(): string {
  return process.env.LOGS_DIR || './logs';
}

/**
 * List all log files in the logs directory
 */
export async function listLogFiles(
  dir?: string,
  recursive = true
): Promise<LogFileInfo[]> {
  const logsDir = dir || getLogsDir();
  const files: LogFileInfo[] = [];

  async function scanDir(currentDir: string, relativePath = ''): Promise<void> {
    try {
      const entries = await fs.promises.readdir(currentDir, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relPath = relativePath
          ? path.join(relativePath, entry.name)
          : entry.name;

        if (entry.isDirectory()) {
          if (recursive) {
            await scanDir(fullPath, relPath);
          }
        } else if (
          entry.name.endsWith('.log') ||
          entry.name.endsWith('.jsonl')
        ) {
          try {
            const stats = await fs.promises.stat(fullPath);
            files.push({
              name: entry.name,
              path: relPath,
              size: stats.size,
              sizeHuman: formatBytes(stats.size),
              modifiedAt: stats.mtime,
              isDirectory: false,
            });
          } catch {
            // Skip files we can't stat
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  await scanDir(logsDir);

  // Sort by modification time, newest first
  files.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());

  return files;
}

/**
 * Efficiently read the last N lines from a file
 * Uses reverse reading for large files
 */
export async function tailFile(
  filePath: string,
  lines = 100
): Promise<string[]> {
  const logsDir = getLogsDir();
  const fullPath = path.join(logsDir, filePath);

  // Check if file exists
  try {
    await fs.promises.access(fullPath, fs.constants.R_OK);
  } catch {
    throw new Error(`File not found or not readable: ${filePath}`);
  }

  const stats = await fs.promises.stat(fullPath);

  // For small files (< 1MB), just read the whole thing
  if (stats.size < 1024 * 1024) {
    const content = await fs.promises.readFile(fullPath, 'utf-8');
    const allLines = content.split('\n').filter((line) => line.length > 0);
    return allLines.slice(-lines);
  }

  // For larger files, read from the end
  return await readLastLines(fullPath, lines);
}

/**
 * Read last N lines from a large file efficiently
 */
async function readLastLines(
  filePath: string,
  lines: number
): Promise<string[]> {
  const result: string[] = [];
  const chunkSize = 64 * 1024; // 64KB chunks
  const stats = await fs.promises.stat(filePath);
  let position = stats.size;
  let buffer = '';

  const fd = await fs.promises.open(filePath, 'r');

  try {
    while (position > 0 && result.length < lines) {
      const readSize = Math.min(chunkSize, position);
      position -= readSize;

      const chunk = Buffer.alloc(readSize);
      await fd.read(chunk, 0, readSize, position);

      buffer = chunk.toString('utf-8') + buffer;

      // Extract complete lines
      const bufferLines = buffer.split('\n');

      // Keep the first partial line in buffer
      buffer = bufferLines[0];

      // Add complete lines to result (in reverse order)
      for (let i = bufferLines.length - 1; i > 0; i--) {
        if (bufferLines[i].length > 0) {
          result.unshift(bufferLines[i]);
          if (result.length >= lines) break;
        }
      }
    }

    // Don't forget the last partial line if we reached the beginning
    if (position === 0 && buffer.length > 0 && result.length < lines) {
      result.unshift(buffer);
    }
  } finally {
    await fd.close();
  }

  return result.slice(-lines);
}

/**
 * Search for a pattern in a log file
 */
export async function searchFile(
  filePath: string,
  pattern: string,
  options: { caseSensitive?: boolean; maxMatches?: number } = {}
): Promise<SearchMatch[]> {
  const logsDir = getLogsDir();
  const fullPath = path.join(logsDir, filePath);
  const matches: SearchMatch[] = [];
  const maxMatches = options.maxMatches || 100;

  const searchPattern = options.caseSensitive ? pattern : pattern.toLowerCase();

  try {
    const fileStream = fs.createReadStream(fullPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let lineNumber = 0;

    for await (const line of rl) {
      lineNumber++;
      const searchLine = options.caseSensitive ? line : line.toLowerCase();

      if (searchLine.includes(searchPattern)) {
        matches.push({
          file: filePath,
          line: lineNumber,
          content: line,
        });

        if (matches.length >= maxMatches) {
          break;
        }
      }
    }
  } catch (error) {
    throw new Error(
      `Failed to search file ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return matches;
}

/**
 * Search for a pattern across multiple log files
 */
export async function searchLogs(
  pattern: string,
  options: {
    files?: string[];
    caseSensitive?: boolean;
    maxMatchesPerFile?: number;
  } = {}
): Promise<Map<string, SearchMatch[]>> {
  const results = new Map<string, SearchMatch[]>();

  let filesToSearch: string[];

  if (options.files && options.files.length > 0) {
    filesToSearch = options.files;
  } else {
    // Search all log files
    const allFiles = await listLogFiles();
    filesToSearch = allFiles.map((f) => f.path);
  }

  for (const file of filesToSearch) {
    try {
      const matches = await searchFile(file, pattern, {
        caseSensitive: options.caseSensitive,
        maxMatches: options.maxMatchesPerFile || 50,
      });

      if (matches.length > 0) {
        results.set(file, matches);
      }
    } catch {
      // Skip files that can't be searched
    }
  }

  return results;
}

/**
 * Extract error lines from log files
 */
export async function getErrorLines(
  options: { files?: string[]; lines?: number } = {}
): Promise<Map<string, string[]>> {
  const errorPatterns = [
    /\bERROR\b/i,
    /\bFATAL\b/i,
    /\bException\b/,
    /\bError:/,
    /\bfailed\b/i,
    /\bcrash/i,
  ];

  const results = new Map<string, string[]>();
  const maxLines = options.lines || 50;

  let filesToCheck: string[];

  if (options.files && options.files.length > 0) {
    filesToCheck = options.files;
  } else {
    // Default to error-related log files
    filesToCheck = ['errors.log', 'server.error.log', 'admin.error.log'];
  }

  for (const file of filesToCheck) {
    try {
      const lines = await tailFile(file, maxLines * 2); // Get more lines to filter
      const errorLines = lines.filter((line) =>
        errorPatterns.some((pattern) => pattern.test(line))
      );

      if (errorLines.length > 0) {
        results.set(file, errorLines.slice(-maxLines));
      }
    } catch {
      // Skip files that don't exist or can't be read
    }
  }

  return results;
}

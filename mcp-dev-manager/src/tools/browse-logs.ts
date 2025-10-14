/**
 * Tool for browsing and searching log files
 */

import path from 'path';
import fs from 'fs/promises';
import { safeExec, validatePath, findFiles, fileExists } from '../utils/exec.js';

interface BrowseLogsArgs {
    action: 'tail' | 'cat' | 'grep' | 'list';
    logFile?: string;
    lines?: number;
    pattern?: string;
    context?: number;
}

export async function browseLogs(
    args: BrowseLogsArgs,
    projectRoot: string
): Promise<string> {
    switch (args.action) {
        case 'list':
            return await listLogFiles(projectRoot);

        case 'tail':
            if (!args.logFile) {
                throw new Error('logFile is required for tail action');
            }
            return await tailLog(projectRoot, args.logFile, args.lines || 50);

        case 'cat':
            if (!args.logFile) {
                throw new Error('logFile is required for cat action');
            }
            return await catLog(projectRoot, args.logFile);

        case 'grep':
            if (!args.logFile) {
                throw new Error('logFile is required for grep action');
            }
            if (!args.pattern) {
                throw new Error('pattern is required for grep action');
            }
            return await grepLog(
                projectRoot,
                args.logFile,
                args.pattern,
                args.context || 3
            );

        default:
            throw new Error(`Unknown action: ${args.action}`);
    }
}

async function listLogFiles(projectRoot: string): Promise<string> {
    // Common log locations
    const logDirs = [
        'logs',
        'test-results',
        'apps/admin/test-results',
        'apps/server-nest/logs',
        '.dev-logs',
    ];

    let output = '# Log Files\n\n';

    for (const dir of logDirs) {
        const dirPath = path.join(projectRoot, dir);
        if (!(await fileExists(dirPath))) {
            continue;
        }

        try {
            const files = await findFiles(dirPath, /\.(log|txt|md|json)$/);

            if (files.length > 0) {
                output += `## ${dir}/\n`;
                for (const file of files) {
                    const relativePath = path.relative(projectRoot, file);
                    const stats = await fs.stat(file);
                    const size = formatSize(stats.size);
                    const mtime = stats.mtime.toISOString().split('T')[0];
                    output += `- \`${relativePath}\` (${size}, modified: ${mtime})\n`;
                }
                output += '\n';
            }
        } catch (error) {
            console.error(`Error reading ${dir}:`, error);
        }
    }

    return output;
}

async function tailLog(
    projectRoot: string,
    logFile: string,
    lines: number
): Promise<string> {
    const filePath = await validatePath(projectRoot, logFile);

    if (!(await fileExists(filePath))) {
        throw new Error(`Log file not found: ${logFile}`);
    }

    const result = await safeExec(`tail -n ${lines} "${filePath}"`);

    let output = `# Tail: ${logFile}\n\n`;
    output += `Last ${lines} lines:\n\n`;
    output += '```\n';
    output += result.stdout || '(empty)';
    output += '\n```\n';

    return output;
}

async function catLog(projectRoot: string, logFile: string): Promise<string> {
    const filePath = await validatePath(projectRoot, logFile);

    if (!(await fileExists(filePath))) {
        throw new Error(`Log file not found: ${logFile}`);
    }

    const stats = await fs.stat(filePath);
    const maxSize = 500 * 1024; // 500KB

    if (stats.size > maxSize) {
        // File too large, show head and tail
        const head = await safeExec(`head -n 100 "${filePath}"`);
        const tail = await safeExec(`tail -n 100 "${filePath}"`);

        let output = `# File: ${logFile}\n\n`;
        output += `⚠️  File is large (${formatSize(stats.size)}). Showing first and last 100 lines.\n\n`;
        output += '## First 100 lines\n```\n';
        output += head.stdout;
        output += '\n```\n\n';
        output += '## Last 100 lines\n```\n';
        output += tail.stdout;
        output += '\n```\n';

        return output;
    }

    const content = await fs.readFile(filePath, 'utf-8');

    let output = `# File: ${logFile}\n\n`;
    output += '```\n';
    output += content;
    output += '\n```\n';

    return output;
}

async function grepLog(
    projectRoot: string,
    logFile: string,
    pattern: string,
    context: number
): Promise<string> {
    const filePath = await validatePath(projectRoot, logFile);

    if (!(await fileExists(filePath))) {
        throw new Error(`Log file not found: ${logFile}`);
    }

    // Escape special characters in pattern for shell
    const escapedPattern = pattern.replace(/"/g, '\\"');

    const result = await safeExec(
        `grep -n -C ${context} "${escapedPattern}" "${filePath}" || echo "No matches found"`
    );

    let output = `# Search: ${logFile}\n\n`;
    output += `Pattern: \`${pattern}\`\n`;
    output += `Context: ${context} lines\n\n`;

    if (result.stdout === 'No matches found') {
        output += '❌ No matches found\n';
    } else {
        output += '```\n';
        output += result.stdout;
        output += '\n```\n';
    }

    return output;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

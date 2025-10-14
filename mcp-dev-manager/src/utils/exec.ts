/**
 * Utilities for safe command execution
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';

const execAsync = promisify(exec);

export interface ExecOptions {
    cwd?: string;
    timeout?: number;
    maxBuffer?: number;
    env?: Record<string, string>;
}

export interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    error?: string;
}

/**
 * Execute a command safely with timeout and error handling
 */
export async function safeExec(
    command: string,
    options: ExecOptions = {}
): Promise<ExecResult> {
    const {
        cwd = process.cwd(),
        timeout = 300000, // 5 minutes default
        maxBuffer = 10 * 1024 * 1024, // 10MB
        env = {},
    } = options;

    try {
        const { stdout, stderr } = await execAsync(command, {
            cwd,
            timeout,
            maxBuffer,
            env: { ...process.env, ...env },
        });

        return {
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: 0,
        };
    } catch (error: any) {
        return {
            stdout: error.stdout?.trim() || '',
            stderr: error.stderr?.trim() || '',
            exitCode: error.code || 1,
            error: error.message,
        };
    }
}

/**
 * Execute a command and stream output (for long-running commands)
 */
export async function streamExec(
    command: string,
    args: string[],
    options: ExecOptions = {}
): Promise<ExecResult> {
    const { cwd = process.cwd(), env = {} } = options;

    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';

        const child = spawn(command, args, {
            cwd,
            env: { ...process.env, ...env },
            shell: true,
        });

        child.stdout?.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            resolve({
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode: code || 0,
            });
        });

        child.on('error', (error) => {
            resolve({
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode: 1,
                error: error.message,
            });
        });
    });
}

/**
 * Validate and resolve a path within PROJECT_ROOT
 */
export async function validatePath(
    projectRoot: string,
    relativePath: string
): Promise<string> {
    const resolvedPath = path.resolve(projectRoot, relativePath);

    // Ensure path is within project root (prevent directory traversal)
    if (!resolvedPath.startsWith(projectRoot)) {
        throw new Error(`Path ${relativePath} is outside project root`);
    }

    return resolvedPath;
}

/**
 * Check if a file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Find files matching a pattern
 */
export async function findFiles(
    directory: string,
    pattern: RegExp
): Promise<string[]> {
    const results: string[] = [];

    async function walk(dir: string): Promise<void> {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    // Skip node_modules and common build directories
                    if (!['node_modules', 'dist', 'build', '.git'].includes(entry.name)) {
                        await walk(fullPath);
                    }
                } else if (pattern.test(entry.name)) {
                    results.push(fullPath);
                }
            }
        } catch (error) {
            // Ignore permission errors
        }
    }

    await walk(directory);
    return results;
}

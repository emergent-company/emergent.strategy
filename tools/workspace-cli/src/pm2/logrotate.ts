import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';

import { describeProcess } from './client.js';
import { WorkspaceCliError } from '../errors.js';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const { LOGROTATE_DEFAULTS } = require('../../pm2/logrotate.config.cjs') as {
    LOGROTATE_DEFAULTS: Record<string, unknown>;
};

const MODULE_NAME = 'pm2-logrotate';
const MODULE_PREFIX = `${MODULE_NAME}:`;

function resolvePm2Binary(): string {
    const binaryName = process.platform === 'win32' ? 'pm2.cmd' : 'pm2';
    const localBinary = path.resolve(process.cwd(), 'node_modules', '.bin', binaryName);

    if (existsSync(localBinary)) {
        return localBinary;
    }

    return binaryName;
}

function normalizeValue(value: unknown): string {
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }

    if (value === null || value === undefined) {
        return '';
    }

    return String(value);
}

async function runPm2Command(args: string[]): Promise<void> {
    const binary = resolvePm2Binary();

    try {
        await execFileAsync(binary, args, {
            cwd: process.cwd(),
            env: process.env
        });
    } catch (error) {
        const nodeError = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };

        if (nodeError.code === 'ENOENT') {
            throw new WorkspaceCliError(
                'LOGROTATE_PM2_NOT_FOUND',
                'Unable to locate the pm2 executable. Install pm2 globally (npm install -g pm2) or ensure node_modules/.bin is on PATH.',
                {
                    recommendation: 'Install pm2 or expose node_modules/.bin/pm2 via PATH before running workspace commands.'
                }
            );
        }

        const stderr = nodeError.stderr?.toString().trim();
        const stdout = nodeError.stdout?.toString().trim();
        const message = stderr || stdout || nodeError.message;

        throw new WorkspaceCliError('LOGROTATE_PM2_COMMAND_FAILED', `pm2 ${args.join(' ')} failed: ${message}`);
    }
}

async function ensureModuleInstalled(): Promise<void> {
    const existing = await describeProcess(MODULE_NAME);

    if (existing) {
        return;
    }

    await runPm2Command(['install', MODULE_NAME]);
}

async function applyModuleSettings(): Promise<void> {
    const entries = Object.entries(LOGROTATE_DEFAULTS);

    for (const [key, value] of entries) {
        const normalized = normalizeValue(value);

        if (normalized === '') {
            continue;
        }

        await runPm2Command(['set', `${MODULE_PREFIX}${key}`, normalized]);
    }
}

let initialized = false;

export async function ensureLogrotateModule(): Promise<void> {
    if (initialized) {
        return;
    }

    await ensureModuleInstalled();
    await applyModuleSettings();
    initialized = true;
}

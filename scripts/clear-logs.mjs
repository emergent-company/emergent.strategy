#!/usr/bin/env node

import { existsSync } from 'fs';
import { mkdir, rm } from 'fs/promises';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = dirname(__dirname);
const LOGS_DIR = join(ROOT_DIR, 'logs');

async function ensureLogsDir() {
    await mkdir(LOGS_DIR, { recursive: true });
}

async function clearLogs() {
    if (!existsSync(LOGS_DIR)) {
        await ensureLogsDir();
        console.log(`ℹ️  Created missing logs directory at ${relative(ROOT_DIR, LOGS_DIR)}`);
        return;
    }

    await rm(LOGS_DIR, { recursive: true, force: true });
    await ensureLogsDir();
    console.log(`🧹 Cleared logs directory: ${relative(ROOT_DIR, LOGS_DIR)}`);
}

clearLogs().catch((error) => {
    console.error('Failed to clear logs:', error);
    process.exitCode = 1;
});

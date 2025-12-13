#!/usr/bin/env node

/**
 * Clear Logs Script
 *
 * Truncates all log files instead of deleting them.
 * This preserves file handles for running processes.
 */

import { existsSync, readdirSync, statSync, truncateSync } from 'fs';
import { mkdir } from 'fs/promises';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = dirname(__dirname);
const LOGS_DIR = join(ROOT_DIR, 'logs');

/**
 * Recursively find all files in a directory
 */
function findFiles(dir, files = []) {
  if (!existsSync(dir)) {
    return files;
  }

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      findFiles(fullPath, files);
    } else if (stat.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Truncate a file to zero bytes
 */
function truncateFile(filePath) {
  try {
    truncateSync(filePath, 0);
    return true;
  } catch (error) {
    console.error(
      `Failed to truncate ${relative(ROOT_DIR, filePath)}: ${error.message}`
    );
    return false;
  }
}

async function ensureLogsDir() {
  await mkdir(LOGS_DIR, { recursive: true });
}

async function clearLogs() {
  if (!existsSync(LOGS_DIR)) {
    await ensureLogsDir();
    console.log(
      `Created missing logs directory at ${relative(ROOT_DIR, LOGS_DIR)}`
    );
    return;
  }

  const files = findFiles(LOGS_DIR);

  if (files.length === 0) {
    console.log('No log files to clear');
    return;
  }

  let cleared = 0;
  let failed = 0;

  for (const file of files) {
    if (truncateFile(file)) {
      cleared++;
    } else {
      failed++;
    }
  }

  console.log(
    `Cleared ${cleared} log file(s) in ${relative(ROOT_DIR, LOGS_DIR)}`
  );
  if (failed > 0) {
    console.warn(`Failed to clear ${failed} file(s)`);
  }
}

clearLogs().catch((error) => {
  console.error('Failed to clear logs:', error);
  process.exitCode = 1;
});

#!/usr/bin/env node

/**
 * Collects the most recent log lines for all primary services.
 *
 * Default behaviour:
 *   - Reads the last 100 lines from each known service log
 *   - Prints a human-readable snapshot grouped by service
 *   - Automatically discovers additional top-level *.log files
 *
 * Options:
 *   --lines <n> / -n <n>    Number of lines per log file (default: 100)
 *   --services=a,b,c        Comma-separated service keys to include (default: all)
 *   --json                  Emit JSON instead of text output
 */

import { open, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(ROOT_DIR, 'logs');

const KNOWN_SERVICES = [
    { key: 'api', label: 'Backend API (dev server)', file: 'api.log' },
    { key: 'admin', label: 'Admin Frontend (Vite dev server)', file: 'admin.log' },
    { key: 'app', label: 'NestJS Application', file: 'app.log' },
    { key: 'errors', label: 'Backend Error Log', file: 'errors.log' },
    { key: 'db', label: 'PostgreSQL (Docker compose)', file: 'db.log' },
];

function parseArgs(argv) {
    const args = {
        lines: 100,
        services: new Set(KNOWN_SERVICES.map(s => s.key)),
        json: false,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const token = argv[i];

        if (token === '--json') {
            args.json = true;
        } else if (token === '--lines' || token === '-n') {
            const next = argv[i + 1];
            if (!next) {
                throw new Error(`${token} requires a value`);
            }
            const parsed = Number.parseInt(next, 10);
            if (Number.isNaN(parsed) || parsed <= 0) {
                throw new Error(`Invalid line count: ${next}`);
            }
            args.lines = parsed;
            i += 1;
        } else if (token.startsWith('--lines=')) {
            const value = token.split('=')[1];
            const parsed = Number.parseInt(value, 10);
            if (Number.isNaN(parsed) || parsed <= 0) {
                throw new Error(`Invalid line count: ${value}`);
            }
            args.lines = parsed;
        } else if (token.startsWith('--services=')) {
            const raw = token.split('=')[1] ?? '';
            const list = raw.split(',').map(part => part.trim()).filter(Boolean);
            if (list.length === 0) {
                throw new Error('Service list cannot be empty');
            }
            const validKeys = new Set(KNOWN_SERVICES.map(s => s.key));
            const unknown = list.filter(key => !validKeys.has(key));
            if (unknown.length > 0) {
                throw new Error(`Unknown service key(s): ${unknown.join(', ')}`);
            }
            args.services = new Set(list);
        } else {
            throw new Error(`Unrecognised option: ${token}`);
        }
    }

    return args;
}

const DEFAULT_CHUNK_SIZE = 64 * 1024; // 64 KiB

async function tailFile(filePath, lines) {
    let fileHandle;
    try {
        fileHandle = await open(filePath, 'r');
        const { size } = await fileHandle.stat();
        if (size === 0) {
            return [];
        }

        const chunks = [];
        let newlineCount = 0;
        let position = size;

        while (position > 0 && newlineCount <= lines) {
            const readSize = Math.min(DEFAULT_CHUNK_SIZE, position);
            position -= readSize;
            const buffer = Buffer.alloc(readSize);
            await fileHandle.read(buffer, 0, readSize, position);
            const chunk = buffer.toString('utf-8');
            chunks.unshift(chunk);
            newlineCount += (chunk.match(/\n/g) || []).length;
        }

        const data = chunks.join('');
        let rawLines = data.split(/\r?\n/);
        if (rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
            rawLines = rawLines.slice(0, -1);
        }
        const slice = lines >= rawLines.length ? rawLines : rawLines.slice(-lines);
        return slice;
    } catch (error) {
        if (error && error.code === 'ENOENT') {
            return null;
        }
        throw error;
    } finally {
        if (fileHandle) {
            await fileHandle.close();
        }
    }
}

async function discoverAdditionalLogs(knownFiles) {
    const extras = [];
    if (!existsSync(LOGS_DIR)) {
        return extras;
    }

    const entries = await readdir(LOGS_DIR, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith('.log')) continue;
        if (knownFiles.has(entry.name)) continue;
        extras.push(entry.name);
    }
    extras.sort();
    return extras;
}

async function collectLogs({ lines, services, json }) {
    if (!existsSync(LOGS_DIR)) {
        const message = `Logs directory not found: ${path.relative(ROOT_DIR, LOGS_DIR)}`;
        if (json) {
            console.log(JSON.stringify({
                generated_at: new Date().toISOString(),
                lines,
                services: [],
                extras: [],
                warnings: [message],
            }, null, 2));
        } else {
            console.error(`⚠️  ${message}`);
        }
        process.exitCode = 1;
        return;
    }

    const selected = KNOWN_SERVICES.filter(service => services.has(service.key));
    const knownFiles = new Set(selected.map(service => service.file));
    const extras = await discoverAdditionalLogs(knownFiles);

    const serviceResults = [];
    for (const service of selected) {
        const absolutePath = path.join(LOGS_DIR, service.file);
        const relativePath = path.relative(ROOT_DIR, absolutePath);
        const data = await tailFile(absolutePath, lines);
        serviceResults.push({
            key: service.key,
            label: service.label,
            path: relativePath,
            exists: data !== null,
            lines: data ?? [],
        });
    }

    const extraResults = [];
    for (const fileName of extras) {
        const absolutePath = path.join(LOGS_DIR, fileName);
        const relativePath = path.relative(ROOT_DIR, absolutePath);
        const data = await tailFile(absolutePath, lines);
        extraResults.push({
            key: fileName.replace(/\.log$/i, ''),
            label: `Additional log (${fileName})`,
            path: relativePath,
            exists: data !== null,
            lines: data ?? [],
        });
    }

    if (json) {
        const payload = {
            generated_at: new Date().toISOString(),
            lines,
            services: serviceResults.map(({ key, label, path: relPath, exists, lines: logLines }) => ({
                key,
                label,
                path: relPath,
                exists,
                lineCount: logLines.length,
                content: logLines,
            })),
            extras: extraResults.map(({ key, label, path: relPath, exists, lines: logLines }) => ({
                key,
                label,
                path: relPath,
                exists,
                lineCount: logLines.length,
                content: logLines,
            })),
        };
        console.log(JSON.stringify(payload, null, 2));
        return;
    }

    const header = `📦 Service log snapshot — ${new Date().toISOString()} (last ${lines} line${lines === 1 ? '' : 's'})`;
    console.log(header);
    console.log('='.repeat(header.length));

    for (const result of serviceResults) {
        console.log(`\n=== ${result.label} [${result.key}] — ${result.path} ===`);
        if (!result.exists) {
            console.log('⚠️  Log file not found. Start the service to generate logs.');
            continue;
        }
        if (result.lines.length === 0) {
            console.log('(log is empty)');
            continue;
        }
        console.log(result.lines.join('\n'));
    }

    if (extraResults.length > 0) {
        console.log('\n=== Additional log files discovered ===');
        for (const result of extraResults) {
            console.log(`\n--- ${result.label} — ${result.path} ---`);
            if (!result.exists) {
                console.log('⚠️  Log file not found.');
                continue;
            }
            if (result.lines.length === 0) {
                console.log('(log is empty)');
                continue;
            }
            console.log(result.lines.join('\n'));
        }
    }
}

(async () => {
    try {
        const args = parseArgs(process.argv.slice(2));
        await collectLogs(args);
    } catch (error) {
        console.error(`✗ ${error.message}`);
        process.exitCode = 1;
    }
})();

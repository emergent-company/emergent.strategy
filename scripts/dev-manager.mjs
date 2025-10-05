#!/usr/bin/env node
/**
 * Development process manager
 * Handles starting/stopping dev servers with proper cleanup
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const PID_DIR = path.join(ROOT_DIR, '.dev-pids');

// Configuration
const SERVICES = {
    api: {
        name: 'Backend API',
        command: 'npm',
        args: ['run', 'dev:server-nest'],
        pidFile: 'api.pid',
        port: 3001,
        color: '\x1b[34m', // Blue
    },
    admin: {
        name: 'Admin Frontend',
        command: 'npm',
        args: ['run', 'dev:admin'],
        pidFile: 'admin.pid',
        port: 5175,
        color: '\x1b[35m', // Magenta
    },
};

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';

// Ensure PID directory exists
async function ensurePidDir() {
    try {
        await fs.mkdir(PID_DIR, { recursive: true });
    } catch (err) {
        // Ignore if exists
    }
}

// Read PID from file
async function readPid(pidFile) {
    try {
        const pidPath = path.join(PID_DIR, pidFile);
        const content = await fs.readFile(pidPath, 'utf-8');
        return parseInt(content.trim(), 10);
    } catch (err) {
        return null;
    }
}

// Write PID to file
async function writePid(pidFile, pid) {
    const pidPath = path.join(PID_DIR, pidFile);
    await fs.writeFile(pidPath, pid.toString(), 'utf-8');
}

// Delete PID file
async function deletePid(pidFile) {
    try {
        const pidPath = path.join(PID_DIR, pidFile);
        await fs.unlink(pidPath);
    } catch (err) {
        // Ignore if doesn't exist
    }
}

// Check if process is running
async function isProcessRunning(pid) {
    try {
        // Send signal 0 to check if process exists without killing it
        process.kill(pid, 0);
        return true;
    } catch (err) {
        return false;
    }
}

// Find process by port
async function findProcessByPort(port) {
    try {
        const { stdout } = await execAsync(`lsof -ti:${port}`);
        const pids = stdout.trim().split('\n').filter(Boolean).map(p => parseInt(p, 10));
        return pids;
    } catch (err) {
        return [];
    }
}

// Kill process gracefully, then forcefully if needed
async function killProcess(pid, name) {
    console.log(`${YELLOW}⏹  Stopping ${name} (PID: ${pid})...${RESET}`);

    try {
        // Try graceful shutdown first (SIGTERM)
        process.kill(pid, 'SIGTERM');

        // Wait up to 5 seconds for graceful shutdown
        for (let i = 0; i < 50; i++) {
            await new Promise(resolve => setTimeout(resolve, 100));
            if (!(await isProcessRunning(pid))) {
                console.log(`${GREEN}✓ ${name} stopped gracefully${RESET}`);
                return true;
            }
        }

        // Force kill if still running (SIGKILL)
        console.log(`${YELLOW}⚠ ${name} didn't stop gracefully, force killing...${RESET}`);
        process.kill(pid, 'SIGKILL');
        await new Promise(resolve => setTimeout(resolve, 500));
        console.log(`${GREEN}✓ ${name} force killed${RESET}`);
        return true;
    } catch (err) {
        if (err.code === 'ESRCH') {
            // Process doesn't exist
            return true;
        }
        console.error(`${RED}✗ Failed to kill ${name}: ${err.message}${RESET}`);
        return false;
    }
}

// Stop a specific service
async function stopService(serviceKey) {
    const service = SERVICES[serviceKey];
    const pid = await readPid(service.pidFile);

    if (pid && await isProcessRunning(pid)) {
        await killProcess(pid, service.name);
        await deletePid(service.pidFile);
        return true;
    }

    // Check if something is running on the port
    const portPids = await findProcessByPort(service.port);
    if (portPids.length > 0) {
        console.log(`${YELLOW}⚠ Found process(es) on port ${service.port} but no PID file${RESET}`);
        for (const portPid of portPids) {
            await killProcess(portPid, `${service.name} (port ${service.port})`);
        }
        return true;
    }

    await deletePid(service.pidFile);
    return false;
}

// Stop all services
async function stopAll() {
    console.log(`${YELLOW}Stopping all services...${RESET}\n`);
    await ensurePidDir();

    for (const [key] of Object.entries(SERVICES)) {
        await stopService(key);
    }

    console.log(`\n${GREEN}✓ All services stopped${RESET}`);
}

// Start a specific service
async function startService(serviceKey) {
    const service = SERVICES[serviceKey];

    // First, ensure any existing process is stopped
    await stopService(serviceKey);

    console.log(`${service.color}▶  Starting ${service.name}...${RESET}`);

    const child = spawn(service.command, service.args, {
        cwd: ROOT_DIR,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        shell: true,
    });

    // Save PID
    await writePid(service.pidFile, child.pid);

    // Prefix output with service name
    const prefix = `${service.color}[${serviceKey}]${RESET} `;

    const formatOutput = (data) => {
        const lines = data.toString().split('\n');
        return lines
            .map((line, i) => (i === lines.length - 1 && line === '') ? '' : prefix + line)
            .join('\n');
    };

    child.stdout.on('data', (data) => {
        process.stdout.write(formatOutput(data));
    });

    child.stderr.on('data', (data) => {
        process.stderr.write(formatOutput(data));
    });

    child.on('exit', async (code) => {
        await deletePid(service.pidFile);
        if (code !== 0 && code !== null) {
            console.log(`${RED}✗ ${service.name} exited with code ${code}${RESET}`);
        }
    });

    return child;
}

// Start all services
async function startAll() {
    console.log(`${GREEN}Starting development servers...${RESET}\n`);
    await ensurePidDir();

    const children = [];

    for (const [key] of Object.entries(SERVICES)) {
        const child = await startService(key);
        children.push(child);
        // Small delay between starts
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`\n${GREEN}✓ All services started${RESET}`);
    console.log(`${YELLOW}Press Ctrl+C to stop all services${RESET}\n`);

    // Handle graceful shutdown
    const cleanup = async () => {
        console.log(`\n${YELLOW}Shutting down...${RESET}`);
        await stopAll();
        process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    // Keep process alive
    await Promise.all(children.map(child =>
        new Promise((resolve) => child.on('exit', resolve))
    ));
}

// Status check
async function status() {
    console.log(`${GREEN}Development Services Status:${RESET}\n`);
    await ensurePidDir();

    for (const [key, service] of Object.entries(SERVICES)) {
        const pid = await readPid(service.pidFile);
        const running = pid && await isProcessRunning(pid);
        const portPids = await findProcessByPort(service.port);

        const statusIcon = running ? `${GREEN}●${RESET}` : `${RED}○${RESET}`;
        const statusText = running ? `${GREEN}running${RESET}` : `${RED}stopped${RESET}`;
        const pidText = running ? ` (PID: ${pid})` : '';
        const portText = portPids.length > 0 && !running ? ` ${YELLOW}(port ${service.port} in use by PID: ${portPids.join(', ')})${RESET}` : '';

        console.log(`${statusIcon} ${service.name.padEnd(20)} ${statusText}${pidText}${portText}`);
    }

    console.log();
}

// Main CLI
async function main() {
    const command = process.argv[2] || 'start';

    try {
        switch (command) {
            case 'start':
                await startAll();
                break;
            case 'stop':
                await stopAll();
                break;
            case 'restart':
                await stopAll();
                await new Promise(resolve => setTimeout(resolve, 1000));
                await startAll();
                break;
            case 'status':
                await status();
                break;
            default:
                console.log(`${YELLOW}Usage: node scripts/dev-manager.mjs [start|stop|restart|status]${RESET}`);
                console.log(`  start   - Start all development services (default)`);
                console.log(`  stop    - Stop all development services`);
                console.log(`  restart - Restart all development services`);
                console.log(`  status  - Show status of all services`);
                process.exit(1);
        }
    } catch (err) {
        console.error(`${RED}Error: ${err.message}${RESET}`);
        process.exit(1);
    }
}

main();

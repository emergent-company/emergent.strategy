#!/usr/bin/env node

/**
 * Ensure dev server is running before E2E tests
 * This script checks if the server is up and starts it if needed
 */

import { spawn } from 'child_process';
import { createServer } from 'net';

const PORT = process.env.ADMIN_PORT || 5175;
const MAX_WAIT = 30000; // 30 seconds max wait
const CHECK_INTERVAL = 500; // Check every 500ms

/**
 * Check if a port is open
 */
function checkPort(port) {
    return new Promise((resolve) => {
        const server = createServer();

        server.once('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(true); // Port is in use (server is running)
            } else {
                resolve(false);
            }
        });

        server.once('listening', () => {
            server.close();
            resolve(false); // Port is free (server not running)
        });

        server.listen(port);
    });
}

/**
 * Wait for server to become available
 */
async function waitForServer(port, timeout) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        const isRunning = await checkPort(port);
        if (isRunning) {
            console.log(`✅ Dev server is running on port ${port}`);
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
    }

    return false;
}

/**
 * Start the dev server
 */
function startDevServer() {
    return new Promise((resolve, reject) => {
        console.log('🚀 Starting dev server...');

        const child = spawn('npm', ['run', 'dev'], {
            cwd: process.cwd(),
            detached: true,
            stdio: 'ignore',
        });

        child.unref();

        // Give it a moment to start
        setTimeout(() => resolve(child.pid), 2000);
    });
}

/**
 * Main function
 */
async function main() {
    console.log(`Checking dev server on port ${PORT}...`);

    // Check if server is already running
    const isRunning = await checkPort(PORT);

    if (isRunning) {
        console.log(`✅ Dev server already running on port ${PORT}`);
        process.exit(0);
    }

    // Start server
    console.log(`⚙️  Dev server not running, starting it...`);
    await startDevServer();

    // Wait for it to become available
    const serverStarted = await waitForServer(PORT, MAX_WAIT);

    if (serverStarted) {
        console.log('✅ Dev server is ready!');
        process.exit(0);
    } else {
        console.error(`❌ Failed to start dev server within ${MAX_WAIT / 1000} seconds`);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});

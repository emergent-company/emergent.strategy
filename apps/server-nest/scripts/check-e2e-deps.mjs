#!/usr/bin/env node

/**
 * Check E2E Test Dependencies
 * 
 * Ensures PostgreSQL and other required services are running before E2E tests.
 * Auto-starts dependencies if they're not running.
 */

import { execSync } from 'child_process';
import { createConnection } from 'net';

const POSTGRES_PORT = process.env.POSTGRES_PORT || 5437;  // Default Docker port
const POSTGRES_HOST = 'localhost';
const TIMEOUT_MS = 5000;

/**
 * Check if a port is open
 */
function isPortOpen(port, host = 'localhost') {
    return new Promise((resolve) => {
        const socket = createConnection({ port, host, timeout: 1000 });

        socket.on('connect', () => {
            socket.end();
            resolve(true);
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });

        socket.on('error', () => {
            resolve(false);
        });
    });
}

/**
 * Execute command and return output
 */
function exec(command) {
    try {
        return execSync(command, {
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe']
        });
    } catch (error) {
        return null;
    }
}

/**
 * Check if Docker is running
 */
function checkDocker() {
    console.log('🐳 Checking Docker...');
    const result = exec('docker ps 2>&1');

    if (result && !result.includes('Cannot connect')) {
        console.log('✅ Docker is running');
        return true;
    }

    console.log('❌ Docker is not running');
    return false;
}

/**
 * Check if PostgreSQL is running
 */
async function checkPostgres() {
    console.log('🔍 Checking PostgreSQL...');
    const isRunning = await isPortOpen(POSTGRES_PORT, POSTGRES_HOST);

    if (isRunning) {
        console.log('✅ PostgreSQL is running on port', POSTGRES_PORT);
        return true;
    }

    console.log('❌ PostgreSQL is not running');
    return false;
}

/**
 * Start dependencies using workspace CLI
 */
function startDependencies() {
    console.log('\n🚀 Starting dependencies...');
    try {
        execSync('nx run workspace-cli:workspace:deps:start', {
            stdio: 'inherit',
            cwd: process.cwd()
        });
        console.log('✅ Dependencies started');
        return true;
    } catch (error) {
        console.error('❌ Failed to start dependencies:', error.message);
        return false;
    }
}

/**
 * Wait for PostgreSQL to be ready
 */
async function waitForPostgres(maxAttempts = 30) {
    console.log('\n⏳ Waiting for PostgreSQL to be ready...');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const isRunning = await isPortOpen(POSTGRES_PORT, POSTGRES_HOST);

        if (isRunning) {
            console.log('✅ PostgreSQL is ready!');
            return true;
        }

        if (attempt < maxAttempts) {
            process.stdout.write(`   Attempt ${attempt}/${maxAttempts}...\r`);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    console.error('\n❌ PostgreSQL did not become ready in time');
    return false;
}

/**
 * Main execution
 */
async function main() {
    console.log('🧪 E2E Test Dependency Check\n');

    // Check if Docker is running
    const dockerRunning = checkDocker();

    if (!dockerRunning) {
        console.error('\n❌ Docker is not running');
        console.error('\nPlease start Docker Desktop and try again.\n');
        console.error('Or start dependencies manually after Docker is running:');
        console.error('  nx run workspace-cli:workspace:deps:start\n');
        process.exit(1);
    }

    // Check if PostgreSQL is already running
    const postgresRunning = await checkPostgres();

    if (!postgresRunning) {
        // Try to start dependencies
        const started = startDependencies();

        if (!started) {
            console.error('\n❌ Could not start dependencies');
            console.error('\nPlease start them manually:');
            console.error('  nx run workspace-cli:workspace:deps:start\n');
            process.exit(1);
        }

        // Wait for PostgreSQL to be ready
        const ready = await waitForPostgres();

        if (!ready) {
            console.error('\n❌ PostgreSQL did not start successfully');
            console.error('\nPlease check logs:');
            console.error('  nx run workspace-cli:workspace:logs -- --service=postgres\n');
            process.exit(1);
        }
    }

    console.log('\n✅ All dependencies ready for E2E tests!\n');
    process.exit(0);
}

main().catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
});

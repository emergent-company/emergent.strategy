#!/usr/bin/env node

/**
 * Ensure E2E Test Dependencies
 *
 * This script checks if all required services for E2E tests are running:
 * 1. Docker containers (PostgreSQL, Zitadel)
 * 2. Admin dev server (Vite on port from ADMIN_PORT env var, defaults to 5176)
 *
 * If any service is not running, it starts them automatically.
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const PORTS = {
  admin: process.env.ADMIN_PORT || 5176,
  postgres: 5437, // Test database port
  zitadel: 8200, // Test Zitadel port
};

const DOCKER_DIR = join(PROJECT_ROOT, 'docker');
const ADMIN_DIR = join(PROJECT_ROOT, 'apps/admin');

/**
 * Check if a port is in use
 */
async function isPortInUse(port) {
  try {
    const { stdout } = await execAsync(`lsof -i :${port} | grep LISTEN`);
    return stdout.trim().length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Check if Docker containers are running
 * Uses port checking instead of docker compose ps for reliability
 * when containers are started with different project names
 */
async function areDockerContainersRunning() {
  try {
    const postgresRunning = await isPortInUse(PORTS.postgres);
    const zitadelRunning = await isPortInUse(PORTS.zitadel);

    return postgresRunning && zitadelRunning;
  } catch (error) {
    return false;
  }
}

/**
 * Start Docker containers
 */
async function startDockerContainers() {
  console.log('🐳 Starting Docker containers...');
  try {
    await execAsync(`cd ${DOCKER_DIR} && docker compose up -d`);
    console.log('✅ Docker containers started');

    // Wait for containers to be healthy
    console.log('⏳ Waiting for containers to be healthy...');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    return true;
  } catch (error) {
    console.error('❌ Failed to start Docker containers:', error.message);
    return false;
  }
}

/**
 * Start admin dev server
 */
async function startAdminServer() {
  console.log('🚀 Starting admin dev server...');

  return new Promise((resolve) => {
    const adminProcess = spawn('npm', ['run', 'dev'], {
      cwd: ADMIN_DIR,
      detached: true,
      stdio: 'ignore',
      shell: true,
    });

    // Detach the process so it continues running
    adminProcess.unref();

    console.log('⏳ Waiting for admin server to start...');

    // Check every second for up to 30 seconds
    let attempts = 0;
    const maxAttempts = 30;

    const checkInterval = setInterval(async () => {
      attempts++;

      const isRunning = await isPortInUse(PORTS.admin);

      if (isRunning) {
        clearInterval(checkInterval);
        console.log('✅ Admin server started on port', PORTS.admin);
        resolve(true);
      } else if (attempts >= maxAttempts) {
        clearInterval(checkInterval);
        console.error('❌ Timeout waiting for admin server to start');
        resolve(false);
      }
    }, 1000);
  });
}

/**
 * Main function
 */
async function main() {
  console.log('🔍 Checking E2E test dependencies...\n');

  let allGood = true;

  // Check Docker containers
  const dockerRunning = await areDockerContainersRunning();
  if (!dockerRunning) {
    console.log('⚠️  Docker containers not running');
    const started = await startDockerContainers();
    if (!started) {
      allGood = false;
    }
  } else {
    console.log('✅ Docker containers are running');
  }

  // Check admin server
  const adminRunning = await isPortInUse(PORTS.admin);
  if (!adminRunning) {
    console.log('⚠️  Admin dev server not running on port', PORTS.admin);
    const started = await startAdminServer();
    if (!started) {
      allGood = false;
    }
  } else {
    console.log('✅ Admin dev server is running on port', PORTS.admin);
  }

  console.log('\n' + '='.repeat(50));
  if (allGood) {
    console.log('✅ All E2E dependencies are ready!');
    process.exit(0);
  } else {
    console.log('❌ Some dependencies failed to start');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * E2E Test Setup Script
 *
 * Ensures all prerequisites for E2E tests are ready:
 * 1. E2E database is running (Docker)
 * 2. Database migrations have been run
 * 3. Database is healthy and ready
 * 4. Admin dev server is running (if needed)
 *
 * Usage: npm run test:e2e:setup
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(message, color = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function logStep(step) {
  log(`\n${step}`, COLORS.cyan);
}

function logSuccess(message) {
  log(`✅ ${message}`, COLORS.green);
}

function logWarning(message) {
  log(`⚠️  ${message}`, COLORS.yellow);
}

function logError(message) {
  log(`❌ ${message}`, COLORS.red);
}

async function isDockerRunning() {
  try {
    await execAsync('docker info > /dev/null 2>&1');
    return true;
  } catch {
    return false;
  }
}

async function isPortInUse(port) {
  try {
    const { stdout } = await execAsync(`lsof -i :${port} | grep LISTEN`);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function isE2EDbHealthy() {
  try {
    // Use docker inspect directly as a more reliable method
    const { stdout } = await execAsync(
      'docker inspect e2e-db-1 --format "{{.State.Health.Status}}"',
      { cwd: PROJECT_ROOT }
    );
    const health = stdout.trim();
    return health === 'healthy';
  } catch (e) {
    // Container might not exist
    return false;
  }
}

async function waitForDbHealthy(maxWaitSeconds = 30) {
  log(`⏳ Waiting for database to be healthy (max ${maxWaitSeconds}s)...`);
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitSeconds * 1000) {
    if (await isE2EDbHealthy()) {
      logSuccess('Database is healthy');
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    process.stdout.write('.');
  }

  console.log('');
  return false;
}

async function hasTablesInDatabase() {
  try {
    const { stdout } = await execAsync(
      'PGPASSWORD=spec psql -h localhost -p 5438 -U spec -d spec_e2e -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = \'kb\';"'
    );
    const count = parseInt(stdout.trim());
    return count > 0;
  } catch {
    return false;
  }
}

async function startE2EDatabase() {
  logStep('📦 Starting E2E database...');

  // Check if already running
  if (await isPortInUse(5438)) {
    logSuccess('E2E database already running on port 5438');

    // Verify it's healthy
    if (await isE2EDbHealthy()) {
      logSuccess('Database is healthy');
      return true;
    } else {
      logWarning('Database is running but not healthy, restarting...');
      await execAsync(
        'docker compose -f docker/e2e/docker-compose.yml restart',
        { cwd: PROJECT_ROOT }
      );
      return await waitForDbHealthy();
    }
  }

  // Start database
  log('Starting database container...');
  await execAsync('docker compose -f docker/e2e/docker-compose.yml up -d', {
    cwd: PROJECT_ROOT,
  });

  // Wait for healthy
  const healthy = await waitForDbHealthy();

  if (!healthy) {
    logError('Database failed to become healthy');
    return false;
  }

  return true;
}

async function runMigrations() {
  logStep('🔄 Running database migrations...');

  // Check if migrations already run
  if (await hasTablesInDatabase()) {
    const { stdout } = await execAsync(
      'PGPASSWORD=spec psql -h localhost -p 5438 -U spec -d spec_e2e -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = \'kb\';"'
    );
    const tableCount = parseInt(stdout.trim());
    logSuccess(`Database already has ${tableCount} tables`);

    // Still run migrations to ensure latest
    log('Checking for pending migrations...');
  }

  // Build if needed (migrations need compiled code)
  log('Ensuring server is built...');
  const serverDistExists = await execAsync(
    'test -d apps/server/dist && echo "exists" || echo "missing"'
  )
    .then((r) => r.stdout.trim() === 'exists')
    .catch(() => false);

  if (!serverDistExists) {
    log('Building server...');
    await execAsync('cd apps/server && npm run build', {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
    logSuccess('Server built');
  }

  // Run migrations
  log('Running TypeORM migrations...');
  const migrationResult = await execAsync(
    'cd apps/server && POSTGRES_HOST=localhost POSTGRES_PORT=5438 POSTGRES_DB=spec_e2e POSTGRES_USER=spec POSTGRES_PASSWORD=spec NODE_ENV=test npx typeorm migration:run -d dist/typeorm.config.js',
    { cwd: PROJECT_ROOT }
  );

  if (migrationResult.stdout.includes('No migrations are pending')) {
    logSuccess('All migrations are up to date');
  } else {
    logSuccess('Migrations completed');
  }

  // Verify tables exist
  const tableCount = await execAsync(
    'PGPASSWORD=spec psql -h localhost -p 5438 -U spec -d spec_e2e -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = \'kb\';"'
  ).then((r) => parseInt(r.stdout.trim()));

  logSuccess(`Database ready with ${tableCount} tables`);
  return true;
}

async function checkAdminServer() {
  logStep('🌐 Checking admin dev server...');

  const adminPort = process.env.ADMIN_PORT || 5176;

  if (await isPortInUse(adminPort)) {
    logSuccess(`Admin server running on port ${adminPort}`);
    return true;
  }

  logWarning(`Admin server not running on port ${adminPort}`);
  log('Some E2E tests may require the admin server.');
  log(`Start it with: nx run admin:dev`);
  return false;
}

async function main() {
  log('\n╔═══════════════════════════════════════════╗', COLORS.cyan);
  log('║   E2E Test Environment Setup              ║', COLORS.cyan);
  log('╚═══════════════════════════════════════════╝\n', COLORS.cyan);

  try {
    // Check Docker
    logStep('🐳 Checking Docker...');
    if (!(await isDockerRunning())) {
      logError('Docker is not running. Please start Docker and try again.');
      process.exit(1);
    }
    logSuccess('Docker is running');

    // Start E2E database
    if (!(await startE2EDatabase())) {
      logError('Failed to start E2E database');
      process.exit(1);
    }

    // Run migrations
    if (!(await runMigrations())) {
      logError('Failed to run migrations');
      process.exit(1);
    }

    // Check admin server (optional)
    await checkAdminServer();

    // Summary
    log('\n╔═══════════════════════════════════════════╗', COLORS.green);
    log('║   ✅ E2E Environment Ready                ║', COLORS.green);
    log('╚═══════════════════════════════════════════╝\n', COLORS.green);

    log('E2E test environment is ready. You can now run:', COLORS.cyan);
    log('  nx run server:test-e2e', COLORS.dim);
    log('  npm run test:e2e --prefix apps/server\n', COLORS.dim);
  } catch (error) {
    logError(`Setup failed: ${error.message}`);
    if (error.stderr) {
      log(error.stderr, COLORS.red);
    }
    process.exit(1);
  }
}

main();

#!/usr/bin/env node
/**
 * Environment Variables Verification Script
 *
 * This script verifies the correctness and placement of environment variables
 * across the workspace. It performs the following checks:
 *
 * 1. Variable Existence - Ensures required variables are set
 * 2. Variable Placement - Warns about variables in wrong files
 * 3. Variable Values - Validates formats and ranges
 * 4. Service Connectivity - Tests connections to external services
 * 5. Configuration Sanity - Detects common misconfigurations
 *
 * Usage:
 *   npm run verify-env                  # Full verification
 *   npm run verify-env -- --quick       # Skip connectivity tests
 *   npm run verify-env -- --verbose     # Show all details
 *   npm run verify-env -- --fix         # Suggest fixes
 *   npm run verify-env -- --usage       # Show variable usage counts
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - Errors found (blocking issues)
 *   2 - Warnings only (non-blocking)
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { parseAllEnvExamples } from './lib/parse-env-example.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const serverDir = resolve(rootDir, 'apps', 'server');
const adminDir = resolve(rootDir, 'apps', 'admin');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

// Parse command line arguments
const args = process.argv.slice(2);
const flags = {
  quick: args.includes('--quick'),
  verbose: args.includes('--verbose'),
  fix: args.includes('--fix'),
  help: args.includes('--help') || args.includes('-h'),
  usage: args.includes('--usage'),
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(message) {
  console.log('');
  log('═'.repeat(70), 'cyan');
  log(message, 'cyan');
  log('═'.repeat(70), 'cyan');
  console.log('');
}

function section(message) {
  console.log('');
  log(`─── ${message} ───`, 'magenta');
  console.log('');
}

// Results tracking
const results = {
  errors: [],
  warnings: [],
  info: [],
  passed: [],
};

function addError(message, fix = null) {
  results.errors.push({ message, fix });
  log(`❌ ${message}`, 'red');
  if (fix && flags.fix) {
    log(`   💡 Fix: ${fix}`, 'yellow');
  }
}

function addWarning(message, reason = null) {
  results.warnings.push({ message, reason });
  log(`⚠️  ${message}`, 'yellow');
  if (reason && flags.verbose) {
    log(`   ℹ️  ${reason}`, 'dim');
  }
}

function addInfo(message) {
  results.info.push(message);
  if (flags.verbose) {
    log(`ℹ️  ${message}`, 'blue');
  }
}

function addPassed(message) {
  results.passed.push(message);
  log(`✅ ${message}`, 'green');
}

// Load all environment files
function loadEnvironment() {
  header('Phase 1: Loading Environment Files');

  const files = [
    { path: resolve(rootDir, '.env'), name: 'root .env', context: 'root' },
    {
      path: resolve(rootDir, '.env.local'),
      name: 'root .env.local',
      context: 'root',
    },
    {
      path: resolve(serverDir, '.env'),
      name: 'server .env',
      context: 'server',
    },
    {
      path: resolve(serverDir, '.env.local'),
      name: 'server .env.local',
      context: 'server',
    },
    { path: resolve(adminDir, '.env'), name: 'admin .env', context: 'admin' },
    {
      path: resolve(adminDir, '.env.local'),
      name: 'admin .env.local',
      context: 'admin',
    },
  ];

  const loadedFiles = [];
  const missingFiles = [];

  files.forEach(({ path, name, context }) => {
    if (existsSync(path)) {
      config({ path, override: true });
      loadedFiles.push({ name, path, context });
      addPassed(`Found ${name}`);
    } else {
      missingFiles.push({ name, context });
      if (name.includes('.local')) {
        addInfo(`Optional file not found: ${name}`);
      } else {
        addWarning(`File not found: ${name}`, 'Expected file missing');
      }
    }
  });

  return { loadedFiles, missingFiles };
}

// Load variable specifications from .env.example files
function loadVariableSpecs() {
  try {
    const paths = {
      root: resolve(rootDir, '.env.example'),
      server: resolve(serverDir, '.env.example'),
      admin: resolve(adminDir, '.env.example'),
    };

    const { varSpecs, allErrors } = parseAllEnvExamples(paths);

    if (allErrors.length > 0) {
      allErrors.forEach((error) => addWarning(`Parse warning: ${error}`));
    }

    return varSpecs;
  } catch (err) {
    addError(`Failed to load .env.example files: ${err.message}`);
    return {
      root: { required: [], optional: [], secrets: [] },
      server: { required: [], optional: [], secrets: [] },
      admin: { required: [], optional: [], secrets: [] },
    };
  }
}

// Check variable existence
function checkVariableExistence(varSpecs) {
  header('Phase 2: Checking Variable Existence');

  ['root', 'server', 'admin'].forEach((context) => {
    section(`${context.toUpperCase()} variables`);

    const spec = varSpecs[context];

    // Helper to format value (mask secrets)
    const formatValue = (varName, value) => {
      const isSecret = spec.secrets.includes(varName);
      if (isSecret && value) {
        // Mask secrets but show length
        return `[SECRET: ${value.length} chars]`;
      }
      if (!value) {
        return '[not set]';
      }
      // Truncate long values
      if (value.length > 60) {
        return `${value.substring(0, 60)}... (${value.length} chars)`;
      }
      return value;
    };

    // Check required variables
    spec.required.forEach((varName) => {
      const value = process.env[varName];
      if (!value) {
        const fix = `Set ${varName} in ${
          context === 'root' ? '.env' : `apps/${context}/.env.local`
        }`;
        addError(`Required variable not set: ${varName}`, fix);
      } else {
        addPassed(`${varName} = ${formatValue(varName, value)}`);
      }
    });

    // Check optional variables (only show if verbose)
    if (flags.verbose) {
      spec.optional.forEach((varName) => {
        const value = process.env[varName];
        if (value) {
          addInfo(`${varName} = ${formatValue(varName, value)}`);
        }
      });
    }
  });
}

// Check variable placement
function checkVariablePlacement(loadedFiles, varSpecs) {
  header('Phase 3: Checking Variable Placement');

  const fileContents = {};
  loadedFiles.forEach(({ name, path, context }) => {
    try {
      const content = readFileSync(path, 'utf-8');
      const vars = [];
      content.split('\n').forEach((line) => {
        const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
        if (match) {
          vars.push(match[1]);
        }
      });
      fileContents[name] = { vars, context };
    } catch (err) {
      addWarning(`Failed to read ${name}: ${err.message}`);
    }
  });

  // Check for variables in wrong files
  Object.entries(fileContents).forEach(([fileName, { vars, context }]) => {
    vars.forEach((varName) => {
      // Check if server variable in root file
      if (context === 'root' && varSpecs.server.required.includes(varName)) {
        addWarning(
          `Server variable ${varName} found in root file ${fileName}`,
          'Server-specific variables should be in apps/server/.env or apps/server/.env.local'
        );
      }

      // Check if root variable in server file
      if (context === 'server' && varSpecs.root.required.includes(varName)) {
        addWarning(
          `Root variable ${varName} found in server file ${fileName}`,
          'Workspace variables should be in root .env or .env.local'
        );
      }

      // Check for secrets in committed files
      if (!fileName.includes('.local')) {
        const isSecret =
          varSpecs.root.secrets.includes(varName) ||
          varSpecs.server.secrets.includes(varName) ||
          varSpecs.admin.secrets.includes(varName);

        if (isSecret) {
          addError(
            `Secret ${varName} found in committed file ${fileName}`,
            `Move ${varName} to ${fileName.replace(
              '.env',
              '.env.local'
            )} (gitignored)`
          );
        }
      }
    });
  });
}

// List files where variables are used
function countVariableUsage(varSpecs) {
  if (!flags.usage) {
    return;
  }

  header('Phase 3.5: Variable Usage Analysis');

  // Collect all variables from all contexts
  const allVars = new Set();
  Object.values(varSpecs).forEach((spec) => {
    spec.required.forEach((v) => allVars.add(v));
    spec.optional.forEach((v) => allVars.add(v));
  });

  const variableUsage = {};
  const unusedVars = [];

  section('Searching codebase for variable usage...');

  allVars.forEach((varName) => {
    try {
      // Use ripgrep to list files where variable is used
      // Search for the variable name in OUR source code only (apps/, scripts/, tools/)
      // Exclude: node_modules, dist, build, coverage, .next, and this verification script itself
      const result = execSync(
        `rg -l -w '${varName}' apps/ scripts/ tools/ -t ts -t js --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/build/**' --glob '!**/.next/**' --glob '!**/coverage/**' --glob '!**/verify-env.mjs'`,
        {
          cwd: rootDir,
          encoding: 'utf-8',
        }
      ).trim();

      // Parse ripgrep output (one file per line)
      const files = result
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((file) => file.trim());

      variableUsage[varName] = files;

      if (files.length === 0) {
        unusedVars.push(varName);
      }
    } catch (err) {
      // If ripgrep fails, mark as no usage
      variableUsage[varName] = [];
      unusedVars.push(varName);
    }
  });

  // Report unused variables
  if (unusedVars.length > 0) {
    section('Unused Variables');
    unusedVars.forEach((varName) => {
      const isSet = process.env[varName];
      if (isSet) {
        addWarning(
          `${varName} is defined but not used in source code`,
          'May be used at runtime or can be removed'
        );
      } else {
        addInfo(`${varName} is not set and not used in source code`);
      }
    });
  }

  // Show detailed usage in verbose mode
  if (flags.verbose) {
    section('Variable Usage by File');

    // Sort by number of files (most used first)
    const sortedVars = Object.entries(variableUsage)
      .filter(([, files]) => files.length > 0)
      .sort(([, a], [, b]) => b.length - a.length);

    sortedVars.forEach(([varName, files]) => {
      const fileCount = files.length;
      const color =
        fileCount === 1 ? 'cyan' : fileCount <= 3 ? 'blue' : 'reset';

      log(`\n${varName} (${fileCount} file${fileCount > 1 ? 's' : ''})`, color);

      // Show first 5 files, or all if less than 5
      const filesToShow = files.slice(0, 5);
      filesToShow.forEach((file) => {
        log(`  • ${file}`, 'dim');
      });

      if (files.length > 5) {
        log(`  ... and ${files.length - 5} more file(s)`, 'dim');
      }
    });

    console.log('');
  }

  // Summary
  const usedVars = Object.entries(variableUsage).filter(
    ([, files]) => files.length > 0
  );
  const singleFileVars = usedVars.filter(([, files]) => files.length === 1);

  addPassed(
    `Usage analysis complete: ${unusedVars.length} unused, ${usedVars.length} used (${singleFileVars.length} in single file)`
  );
}

// Validate variable values
function validateVariableValues() {
  header('Phase 4: Validating Variable Values');

  // Port validation
  ['ADMIN_PORT', 'SERVER_PORT', 'POSTGRES_PORT'].forEach((varName) => {
    const value = process.env[varName];
    if (value) {
      const port = parseInt(value, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        addError(
          `Invalid port for ${varName}: ${value}`,
          'Must be a number between 1 and 65535'
        );
      } else {
        addPassed(`${varName} has valid port: ${port}`);
      }
    }
  });

  // Boolean validation
  [
    'DB_AUTOINIT',
    'CHAT_MODEL_ENABLED',
    'EMBEDDINGS_NETWORK_DISABLED',
    'RLS_POLICY_STRICT',
    'EXTRACTION_WORKER_ENABLED',
    'ORGS_DEMO_SEED',
    'LANGSMITH_TRACING',
  ].forEach((varName) => {
    const value = process.env[varName];
    if (value && !['true', 'false', '0', '1'].includes(value.toLowerCase())) {
      addWarning(`${varName} should be true/false or 0/1, got: ${value}`);
    } else if (value) {
      addPassed(`${varName} has valid boolean: ${value}`);
    }
  });

  // Number validation
  const numberVars = [
    'EXTRACTION_WORKER_POLL_INTERVAL_MS',
    'EXTRACTION_WORKER_BATCH_SIZE',
    'EXTRACTION_RATE_LIMIT_RPM',
    'EXTRACTION_RATE_LIMIT_TPM',
    'EXTRACTION_CHUNK_SIZE',
    'EXTRACTION_CHUNK_OVERLAP',
    'EMBEDDING_DIMENSION',
  ];

  numberVars.forEach((varName) => {
    const value = process.env[varName];
    if (value) {
      const num = Number(value);
      if (isNaN(num)) {
        addError(`${varName} must be a number, got: ${value}`);
      } else {
        addPassed(`${varName} has valid number: ${num}`);
      }
    }
  });

  // Threshold validation (0.0 - 1.0)
  [
    'EXTRACTION_CONFIDENCE_THRESHOLD_MIN',
    'EXTRACTION_CONFIDENCE_THRESHOLD_REVIEW',
    'EXTRACTION_CONFIDENCE_THRESHOLD_AUTO',
  ].forEach((varName) => {
    const value = process.env[varName];
    if (value) {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0 || num > 1) {
        addError(`${varName} must be between 0.0 and 1.0, got: ${value}`);
      } else {
        addPassed(`${varName} has valid threshold: ${num}`);
      }
    }
  });

  // URL validation
  [
    'CORS_ORIGIN',
    'ZITADEL_ISSUER',
    'GOOGLE_REDIRECT_URL',
    'BIBLE_SEED_API_URL',
    'VITE_API_URL',
    'VITE_OIDC_AUTHORITY',
  ].forEach((varName) => {
    const value = process.env[varName];
    if (value) {
      try {
        new URL(value);
        addPassed(`${varName} has valid URL format`);
      } catch {
        addWarning(`${varName} may not be a valid URL: ${value}`);
      }
    }
  });

  // Email validation
  ['TEST_USER_EMAIL', 'E2E_TEST_USER_EMAIL'].forEach((varName) => {
    const value = process.env[varName];
    if (value) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        addWarning(`${varName} may not be a valid email: ${value}`);
      } else {
        addPassed(`${varName} has valid email format`);
      }
    }
  });

  // Check embedding dimension matches model
  const embeddingDim = process.env.EMBEDDING_DIMENSION;
  if (embeddingDim && embeddingDim !== '768') {
    addWarning(
      `EMBEDDING_DIMENSION is ${embeddingDim}, but text-embedding-004 uses 768`,
      'Update EMBEDDING_DIMENSION to 768 to match text-embedding-004'
    );
  }
}

// Test service connectivity
async function testServiceConnectivity() {
  if (flags.quick) {
    addInfo('Skipping connectivity tests (--quick mode)');
    return;
  }

  header('Phase 5: Testing Service Connectivity');

  // Test Vertex AI
  await testVertexAI();

  // Test PostgreSQL
  await testPostgreSQL();

  // Test Zitadel
  await testZitadel();
}

async function testVertexAI() {
  section('Vertex AI');

  const projectId = process.env.GCP_PROJECT_ID;
  const location = process.env.VERTEX_AI_LOCATION;
  const model = process.env.VERTEX_AI_MODEL;

  if (!projectId || !location || !model) {
    addWarning('Vertex AI not configured, skipping connectivity test');
    return;
  }

  try {
    const { VertexAI } = await import('@google-cloud/vertexai');
    const vertexAI = new VertexAI({ project: projectId, location });
    addPassed('Vertex AI client initialized successfully');

    // Try to make a test request
    try {
      const { GoogleAuth } = await import('google-auth-library');
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      const client = await auth.getClient();
      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/text-embedding-004:predict`;

      const response = await client.request({
        url,
        method: 'POST',
        data: { instances: [{ content: 'test' }] },
      });

      if (response.data && response.data.predictions) {
        addPassed('Vertex AI embeddings API is accessible');
      }
    } catch (err) {
      addWarning(
        `Vertex AI API test failed: ${err.message}`,
        'Check credentials and permissions'
      );
    }
  } catch (err) {
    addError(
      `Vertex AI initialization failed: ${err.message}`,
      'Check GCP_PROJECT_ID and VERTEX_AI_LOCATION'
    );
  }
}

async function testPostgreSQL() {
  section('PostgreSQL');

  const host = process.env.POSTGRES_HOST;
  const port = process.env.POSTGRES_PORT;
  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;
  const database = process.env.POSTGRES_DB;

  if (!host || !port || !user || !database) {
    addWarning('PostgreSQL not configured, skipping connectivity test');
    return;
  }

  try {
    const { default: pg } = await import('pg');
    const client = new pg.Client({
      host,
      port: parseInt(port, 10),
      user,
      password,
      database,
      connectionTimeoutMillis: 5000,
    });

    await client.connect();
    const result = await client.query('SELECT version()');
    await client.end();

    addPassed(`PostgreSQL connection successful`);
    if (flags.verbose) {
      addInfo(`PostgreSQL version: ${result.rows[0].version.split(' ')[0]}`);
    }
  } catch (err) {
    addError(
      `PostgreSQL connection failed: ${err.message}`,
      'Check POSTGRES_* variables and ensure database is running'
    );
  }
}

async function testZitadel() {
  section('Zitadel');

  const issuer = process.env.ZITADEL_ISSUER;

  if (!issuer) {
    addWarning('Zitadel not configured, skipping connectivity test');
    return;
  }

  try {
    const wellKnownUrl = `${issuer}/.well-known/openid-configuration`;
    const response = await fetch(wellKnownUrl);

    if (response.ok) {
      const config = await response.json();
      addPassed('Zitadel OIDC discovery endpoint is accessible');
      if (flags.verbose) {
        addInfo(`Zitadel issuer: ${config.issuer}`);
      }
    } else {
      addWarning(
        `Zitadel returned status ${response.status}`,
        'Check ZITADEL_ISSUER and ensure Zitadel is running'
      );
    }
  } catch (err) {
    addError(
      `Zitadel connection failed: ${err.message}`,
      'Check ZITADEL_ISSUER and network connectivity'
    );
  }
}

// Print summary
function printSummary() {
  header('Verification Summary');

  log(
    `Total Checks: ${
      results.passed.length + results.errors.length + results.warnings.length
    }`,
    'bold'
  );
  log(`✅ Passed: ${results.passed.length}`, 'green');
  log(`⚠️ Warnings: ${results.warnings.length}`, 'yellow');
  log(`❌ Errors: ${results.errors.length}`, 'red');

  if (results.errors.length > 0) {
    section('Errors (must be fixed)');
    results.errors.forEach(({ message, fix }) => {
      log(`  ❌ ${message}`, 'red');
      if (fix && flags.fix) {
        log(`     💡 ${fix}`, 'yellow');
      }
    });
  }

  if (results.warnings.length > 0 && flags.verbose) {
    section('Warnings (recommended fixes)');
    results.warnings.forEach(({ message, reason }) => {
      log(`  ⚠️  ${message}`, 'yellow');
      if (reason) {
        log(`     ${reason}`, 'dim');
      }
    });
  }

  console.log('');

  if (results.errors.length === 0 && results.warnings.length === 0) {
    log('🎉 All environment variables are correctly configured!', 'green');
  } else if (results.errors.length === 0) {
    log('✅ No errors found, but there are some warnings to review', 'yellow');
  } else {
    log(
      '❌ Configuration errors detected. Please fix them before running the application.',
      'red'
    );
  }

  console.log('');
}

// Show help
function showHelp() {
  log('Environment Variables Verification Script', 'cyan');
  console.log('');
  log('Usage:', 'bold');
  console.log('  npm run verify-env                  Full verification');
  console.log('  npm run verify-env -- --quick       Skip connectivity tests');
  console.log('  npm run verify-env -- --verbose     Show all details');
  console.log('  npm run verify-env -- --fix         Suggest fixes');
  console.log(
    '  npm run verify-env -- --usage       Show variable usage counts'
  );
  console.log('  npm run verify-env -- --help        Show this help');
  console.log('');
  log('Checks:', 'bold');
  console.log(
    '  1. Variable Existence     - Ensures required variables are set'
  );
  console.log(
    '  2. Variable Placement     - Warns about variables in wrong files'
  );
  console.log('  3. Variable Values        - Validates formats and ranges');
  console.log(
    '  4. Service Connectivity   - Tests connections to external services'
  );
  console.log('');
  log('Exit codes:', 'bold');
  console.log('  0 - All checks passed');
  console.log('  1 - Errors found (blocking issues)');
  console.log('  2 - Warnings only (non-blocking)');
  console.log('');
}

// Main execution
async function main() {
  if (flags.help) {
    showHelp();
    process.exit(0);
  }

  console.log('');
  log('🔍 Environment Variables Verification', 'cyan');
  console.log('');

  // Phase 0: Load variable specifications from .env.example files
  const varSpecs = loadVariableSpecs();

  // Phase 1: Load environment
  const { loadedFiles } = loadEnvironment();

  // Phase 2: Check existence
  checkVariableExistence(varSpecs);

  // Phase 3: Check placement
  checkVariablePlacement(loadedFiles, varSpecs);

  // Phase 3.5: Count usage (optional)
  countVariableUsage(varSpecs);

  // Phase 4: Validate values
  validateVariableValues();

  // Phase 5: Test connectivity
  await testServiceConnectivity();

  // Print summary
  printSummary();

  // Exit with appropriate code
  if (results.errors.length > 0) {
    process.exit(1);
  } else if (results.warnings.length > 0) {
    process.exit(2);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  log(`\n💥 Unexpected error: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});

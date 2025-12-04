#!/usr/bin/env node
/**
 * Test Vertex AI Credentials and Services
 *
 * This script tests:
 * 1. Vertex AI credentials are valid
 * 2. Embeddings API is accessible
 * 3. Chat/LLM API is accessible
 *
 * IMPORTANT: This script mimics the server's environment loading behavior:
 * - Root .env files load first (via dotenv/config)
 * - Server .env files override root settings
 * - Shows TWO PHASES: root config vs server config
 *
 * Usage: cd apps/server && node scripts/test-vertex-ai-credentials.mjs
 */

import { ChatVertexAI } from '@langchain/google-vertexai';
import { VertexAI } from '@google-cloud/vertexai';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serverDir = resolve(__dirname, '..');
const rootDir = resolve(serverDir, '..', '..');

// ANSI colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  dim: '\x1b[2m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(message) {
  console.log('');
  log('='.repeat(70), 'cyan');
  log(message, 'cyan');
  log('='.repeat(70), 'cyan');
  console.log('');
}

function subheader(message) {
  console.log('');
  log(`--- ${message} ---`, 'magenta');
  console.log('');
}

// Track environment variable sources
const varSources = {};

function captureEnvState(phase) {
  const vars = [
    'GCP_PROJECT_ID',
    'VERTEX_AI_PROJECT_ID',
    'VERTEX_AI_LOCATION',
    'VERTEX_AI_MODEL',
    'GOOGLE_APPLICATION_CREDENTIALS',
  ];

  const state = {};
  vars.forEach((varName) => {
    const value = process.env[varName];
    state[varName] = value;

    // Track the first time we see each variable
    if (value && !varSources[varName]) {
      varSources[varName] = phase;
    }
  });

  return state;
}

function compareEnvStates(before, after) {
  const vars = Object.keys(before);
  const changes = [];
  const unchanged = [];

  vars.forEach((varName) => {
    const beforeVal = before[varName];
    const afterVal = after[varName];

    if (beforeVal !== afterVal) {
      changes.push({
        varName,
        before: beforeVal || '(not set)',
        after: afterVal || '(not set)',
      });
    } else if (afterVal) {
      unchanged.push({ varName, value: afterVal });
    }
  });

  return { changes, unchanged };
}

function loadEnvironment() {
  header('PHASE 0: Initial Variable Readings');

  // Capture initial state (from shell environment)
  const initialState = captureEnvState('shell');

  log('Variables from shell environment:', 'blue');
  Object.entries(initialState).forEach(([key, value]) => {
    if (value) {
      log(`  ${key}=${value}`, 'green');
    } else {
      log(`  ${key}=(not set)`, 'dim');
    }
  });

  // Phase 1: Load root .env files
  header('PHASE 1: Loading Root Folder Configuration');

  const rootEnvFiles = [
    { path: resolve(rootDir, '.env'), name: '.env' },
    { path: resolve(rootDir, '.env.local'), name: '.env.local' },
  ];

  rootEnvFiles.forEach(({ path, name }) => {
    if (existsSync(path)) {
      log(`✓ Found ${name}`, 'green');
      config({ path, override: false });
    } else {
      log(`✗ Not found: ${name}`, 'dim');
    }
  });

  const afterRootState = captureEnvState('root');
  const rootComparison = compareEnvStates(initialState, afterRootState, 'root');

  if (rootComparison.changes.length > 0) {
    subheader('Changes after loading root config');
    rootComparison.changes.forEach(({ varName, before, after }) => {
      log(`  ${varName}:`, 'yellow');
      log(`    Before: ${before}`, 'dim');
      log(`    After:  ${after}`, 'green');
    });
  } else {
    log('No changes from root configuration', 'dim');
  }

  // Phase 2: Load server .env files
  header('PHASE 2: Loading Server Configuration');

  const serverEnvFiles = [
    { path: resolve(serverDir, '.env'), name: 'apps/server/.env' },
    { path: resolve(serverDir, '.env.local'), name: 'apps/server/.env.local' },
  ];

  serverEnvFiles.forEach(({ path, name }) => {
    if (existsSync(path)) {
      log(`✓ Found ${name}`, 'green');
      config({ path, override: true }); // Server overrides root
    } else {
      log(`✗ Not found: ${name}`, 'dim');
    }
  });

  const afterServerState = captureEnvState('server');
  const serverComparison = compareEnvStates(
    afterRootState,
    afterServerState,
    'server'
  );

  if (serverComparison.changes.length > 0) {
    subheader('Changes after loading server config (OVERRIDES)');
    serverComparison.changes.forEach(({ varName, before, after }) => {
      log(`  ${varName}:`, 'yellow');
      log(`    Before: ${before}`, 'dim');
      log(`    After:  ${after}`, 'green');
    });
  } else {
    log('No overrides from server configuration', 'dim');
  }

  // Final summary
  header('PHASE 3: Final Configuration Summary');

  log('Variable sources:', 'blue');
  const allVars = Object.keys(afterServerState).sort();
  allVars.forEach((varName) => {
    const value = afterServerState[varName];
    const source = varSources[varName] || 'not set';

    if (value) {
      const sourceColor =
        source === 'server' ? 'yellow' : source === 'root' ? 'cyan' : 'magenta';
      log(`  ${varName}:`, 'blue');
      log(`    Value:  ${value}`, 'green');
      log(`    Source: ${source}`, sourceColor);
    } else {
      log(`  ${varName}: (not set)`, 'dim');
    }
  });

  return afterServerState;
}

async function testCredentials() {
  header('TEST 1: Vertex AI Credentials');

  const projectId =
    process.env.GCP_PROJECT_ID || process.env.VERTEX_AI_PROJECT_ID;
  const location = process.env.VERTEX_AI_LOCATION;
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  log(`Project ID: ${projectId || 'NOT SET'}`, projectId ? 'green' : 'red');
  log(`Location: ${location || 'NOT SET'}`, location ? 'green' : 'red');
  log(
    `Credentials: ${credentialsPath || 'NOT SET (using default)'}`,
    credentialsPath ? 'green' : 'yellow'
  );

  if (!projectId) {
    log('❌ GCP_PROJECT_ID is required', 'red');
    return false;
  }

  if (!location) {
    log('❌ VERTEX_AI_LOCATION is required', 'red');
    return false;
  }

  try {
    // Try to initialize Vertex AI client
    new VertexAI({
      project: projectId,
      location: location,
    });
    log('✅ Vertex AI client initialized successfully', 'green');
    return true;
  } catch (error) {
    log(`❌ Failed to initialize Vertex AI client: ${error.message}`, 'red');
    return false;
  }
}

async function testEmbeddings() {
  header('TEST 2: Embeddings API');

  const projectId =
    process.env.GCP_PROJECT_ID || process.env.VERTEX_AI_PROJECT_ID;
  const location = process.env.VERTEX_AI_LOCATION;
  const model = 'text-embedding-004';

  log(`Project ID: ${projectId || 'NOT SET'}`, projectId ? 'green' : 'red');
  log(`Location: ${location || 'NOT SET'}`, location ? 'green' : 'red');
  log(`Model: ${model}`, 'green');

  if (!projectId) {
    log('❌ GCP_PROJECT_ID is required', 'red');
    return false;
  }

  if (!location) {
    log('❌ VERTEX_AI_LOCATION is required', 'red');
    return false;
  }

  try {
    // Use aiplatform.googleapis.com REST API for embeddings
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });

    const client = await auth.getClient();
    const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`;

    log('Generating embeddings for: "Hello, Vertex AI!"', 'blue');
    const startTime = Date.now();

    const response = await client.request({
      url: url,
      method: 'POST',
      data: {
        instances: [
          {
            content: 'Hello, Vertex AI!',
          },
        ],
      },
    });

    const duration = Date.now() - startTime;

    if (response.data && response.data.predictions) {
      const embedding = response.data.predictions[0]?.embeddings?.values;
      const dimension = embedding?.length || 0;
      log(`✅ Embeddings generated successfully in ${duration}ms`, 'green');
      log(`Embedding dimension: ${dimension}`, 'green');
      log(`First 5 values: [${embedding?.slice(0, 5).join(', ')}...]`, 'green');
      return true;
    } else {
      log('❌ No embeddings returned', 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Embeddings test failed: ${error.message}`, 'red');
    if (error.response?.data) {
      log(`Error details: ${JSON.stringify(error.response.data)}`, 'red');
    }
    if (error.stack) {
      log(`Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`, 'red');
    }
    return false;
  }
}

async function testChat() {
  header('TEST 3: Chat/LLM API');

  const projectId =
    process.env.GCP_PROJECT_ID || process.env.VERTEX_AI_PROJECT_ID;
  const location = process.env.VERTEX_AI_LOCATION;
  const model = process.env.VERTEX_AI_MODEL;

  log(`Project ID: ${projectId || 'NOT SET'}`, projectId ? 'green' : 'red');
  log(`Location: ${location || 'NOT SET'}`, location ? 'green' : 'red');
  log(`Model: ${model || 'NOT SET'}`, model ? 'green' : 'red');

  // Show where model value came from
  if (model && varSources['VERTEX_AI_MODEL']) {
    const source = varSources['VERTEX_AI_MODEL'];
    const sourceColor =
      source === 'server' ? 'yellow' : source === 'root' ? 'cyan' : 'magenta';
    log(`Model source: ${source}`, sourceColor);
  }

  if (!projectId) {
    log('❌ GCP_PROJECT_ID is required', 'red');
    return false;
  }

  if (!location) {
    log('❌ VERTEX_AI_LOCATION is required', 'red');
    return false;
  }

  if (!model) {
    log('❌ VERTEX_AI_MODEL is required', 'red');
    return false;
  }

  try {
    log('Initializing ChatVertexAI...', 'blue');
    const chat = new ChatVertexAI({
      model: model,
      authOptions: {
        projectId: projectId,
      },
      location: location,
      temperature: 0,
      maxOutputTokens: 100,
    });

    log('Sending message: "Echo: Hello, Vertex AI!"', 'blue');
    const startTime = Date.now();

    const response = await chat.invoke([
      {
        role: 'user',
        content:
          'Please respond with exactly: "Hello! I am Gemini on Vertex AI."',
      },
    ]);

    const duration = Date.now() - startTime;

    if (response && response.content) {
      log(`✅ Chat response received in ${duration}ms`, 'green');
      log(`Response: ${response.content}`, 'green');
      return true;
    } else {
      log('❌ No response content', 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Chat test failed: ${error.message}`, 'red');
    if (error.response?.data) {
      log(`Error data: ${JSON.stringify(error.response.data, null, 2)}`, 'red');
    }
    if (error.stack) {
      log(`Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`, 'red');
    }
    return false;
  }
}

async function main() {
  console.log('');
  log('🧪 Vertex AI Credentials Test Suite', 'cyan');
  console.log('');

  // Load environment in phases and show where variables come from
  loadEnvironment();

  const results = {
    credentials: false,
    embeddings: false,
    chat: false,
  };

  // Test 1: Credentials
  results.credentials = await testCredentials();

  if (!results.credentials) {
    log('\n⚠️  Skipping API tests due to credential issues', 'yellow');
  } else {
    // Test 2: Embeddings
    results.embeddings = await testEmbeddings();

    // Test 3: Chat
    results.chat = await testChat();
  }

  // Summary
  header('Test Summary');

  const statusIcon = (passed) => (passed ? '✅' : '❌');
  const statusColor = (passed) => (passed ? 'green' : 'red');

  log(
    `${statusIcon(results.credentials)} Credentials: ${
      results.credentials ? 'PASS' : 'FAIL'
    }`,
    statusColor(results.credentials)
  );
  log(
    `${statusIcon(results.embeddings)} Embeddings API: ${
      results.embeddings ? 'PASS' : 'FAIL'
    }`,
    statusColor(results.embeddings)
  );
  log(
    `${statusIcon(results.chat)} Chat/LLM API: ${
      results.chat ? 'PASS' : 'FAIL'
    }`,
    statusColor(results.chat)
  );

  const allPassed = results.credentials && results.embeddings && results.chat;
  console.log('');
  log(
    allPassed ? '🎉 All tests passed!' : '❌ Some tests failed',
    allPassed ? 'green' : 'red'
  );
  console.log('');

  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  log(`\n💥 Unexpected error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

/**
 * Shared configuration for extraction tests
 */

import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config as dotenvConfig } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve paths relative to project root
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// Load .env file from project root
dotenvConfig({ path: path.resolve(PROJECT_ROOT, '.env') });

export const CONFIG = {
  // Vertex AI settings
  projectId: process.env.GCP_PROJECT_ID || 'spec-server-dev',
  location: process.env.VERTEX_AI_LOCATION || 'europe-central2',
  model: process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash-lite',

  // Credentials
  credentialsPath: path.resolve(PROJECT_ROOT, 'spec-server-dev-vertex-ai.json'),

  // Timeouts
  defaultTimeoutMs: 60_000,
  maxTimeoutMs: 120_000,

  // LLM settings
  temperature: 0.1,
  maxOutputTokens: 8000,

  // Test runner defaults
  defaultRuns: 3,
  warmupRuns: 1,
} as const;

// Set credentials on import
process.env.GOOGLE_APPLICATION_CREDENTIALS = CONFIG.credentialsPath;

export type ExtractionConfig = typeof CONFIG;

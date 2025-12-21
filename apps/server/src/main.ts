/**
 * OpenTelemetry Bootstrap Entry Point
 *
 * This file exists to ensure OpenTelemetry SDK is started BEFORE any HTTP-using
 * modules (NestJS, Express, etc.) are loaded.
 *
 * TypeScript hoists all `import` statements to the top of the file during compilation,
 * which means we can't reliably run code between imports. The solution is to:
 *
 * 1. Start OTEL SDK in this bootstrap file using synchronous execution
 * 2. Dynamically import the actual main.ts module AFTER SDK is started
 *
 * This ensures HTTP module patching happens before NestJS loads it.
 */

// DIAGNOSTIC: Check if http module is already loaded BEFORE any imports
// We check the require.cache WITHOUT loading http to avoid pre-loading it
// eslint-disable-next-line @typescript-eslint/no-var-requires
const httpCacheCheck = !!require.cache[require.resolve('http')];
const expressCacheCheck = !!require.cache[require.resolve('express')];
console.log(
  `[bootstrap-diag] BEFORE imports: http in cache=${httpCacheCheck}, express in cache=${expressCacheCheck}`
);

// Step 1: Import and start OTEL SDK synchronously
// tracing.ts loads .env via dotenv at the top, so env vars are available
import { startOtelSdkSync, isOtelEnabled } from './tracing';

console.log('[bootstrap] Starting OpenTelemetry bootstrap...');
console.log(
  `[bootstrap] OTEL_ENABLED=${process.env.OTEL_ENABLED}, isOtelEnabled=${isOtelEnabled}`
);

// Start OTEL SDK synchronously BEFORE importing NestJS
if (isOtelEnabled || process.env.OTEL_ENABLED === 'true') {
  console.log('[bootstrap] Starting OTEL SDK synchronously...');
  startOtelSdkSync();
  console.log('[bootstrap] OTEL SDK started, now importing main module...');
} else {
  console.log('[bootstrap] OTEL disabled, skipping SDK start');
}

// Step 2: Dynamically import the main bootstrap logic
// This MUST happen AFTER SDK is started so HTTP instrumentation is active
import('./main-bootstrap').catch((err) => {
  console.error('[bootstrap] Failed to load main-bootstrap:', err);
  process.exit(1);
});

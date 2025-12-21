/**
 * OpenTelemetry Tracing and Logging Configuration
 *
 * This file configures distributed tracing AND logs export for the Emergent server.
 * It MUST be imported at the very top of main.ts BEFORE any other imports.
 *
 * Sends traces and logs to SigNoz via OTLP protocol.
 *
 * Environment Variables:
 *   OTEL_ENABLED=true              - Enable/disable tracing (default: false)
 *   OTEL_LOGS_ENABLED=true         - Enable/disable logs export (default: same as OTEL_ENABLED)
 *   OTEL_SERVICE_NAME=emergent-server
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
 *   OTEL_LOG_LEVEL=info
 *   OTEL_CONSOLE_DEBUG=true        - Enable console span output for local debugging
 *   OTEL_SAMPLING_RATE=0.1         - Trace sampling rate (0.0-1.0, default: 1.0 dev, 0.1 prod)
 *
 * Integration with nestjs-otel:
 *   This setup provides automatic instrumentation for HTTP, Express, PostgreSQL, etc.
 *   Use @Span(), @Traceable(), and TraceService from nestjs-otel for custom spans.
 */

// Load environment variables FIRST - before anything else
// This is critical because tracing must be configured before other imports
import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from workspace root (2 levels up from apps/server/src)
const envPath = resolve(__dirname, '../../../.env');
config({ path: envPath });

import { NodeSDK } from '@opentelemetry/sdk-node';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import * as resourcesModule from '@opentelemetry/resources';
import { B3Propagator, B3InjectEncoding } from '@opentelemetry/propagator-b3';
import {
  CompositePropagator,
  W3CTraceContextPropagator,
  W3CBaggagePropagator,
} from '@opentelemetry/core';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BatchSpanProcessor,
  SimpleSpanProcessor,
  ConsoleSpanExporter,
  TraceIdRatioBasedSampler,
  ParentBasedSampler,
} from '@opentelemetry/sdk-trace-base';
import { trace } from '@opentelemetry/api';
import {
  SEMRESATTRS_SERVICE_NAME,
  SEMRESATTRS_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  propagation,
  context as otelContext,
} from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import {
  LoggerProvider,
  BatchLogRecordProcessor,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';

// Check if OpenTelemetry is enabled
// DEBUG: Log what we see at module load time
console.log(
  `[tracing.ts] Module loading - OTEL_ENABLED=${process.env.OTEL_ENABLED}`
);
const isEnabled = process.env.OTEL_ENABLED === 'true';
console.log(`[tracing.ts] isEnabled=${isEnabled}`);

// Logs can be controlled separately, defaults to same as OTEL_ENABLED
const isLogsEnabled =
  process.env.OTEL_LOGS_ENABLED === 'true' ||
  (process.env.OTEL_LOGS_ENABLED !== 'false' && isEnabled);

// Store SDK reference for exports
let sdk: NodeSDK | null = null;
let loggerProvider: LoggerProvider | null = null;

if (!isEnabled) {
  console.log(
    '📊 OpenTelemetry tracing is DISABLED (set OTEL_ENABLED=true to enable)'
  );
} else {
  // Set up diagnostic logging based on environment
  const logLevel = process.env.OTEL_LOG_LEVEL || 'info';
  const diagLevel =
    {
      debug: DiagLogLevel.DEBUG,
      info: DiagLogLevel.INFO,
      warn: DiagLogLevel.WARN,
      error: DiagLogLevel.ERROR,
    }[logLevel] || DiagLogLevel.INFO;

  diag.setLogger(new DiagConsoleLogger(), diagLevel);

  // Service identification
  const serviceName = process.env.OTEL_SERVICE_NAME || 'emergent-server';
  const serviceVersion = process.env.npm_package_version || '0.1.0';
  const environment = process.env.NODE_ENV || 'development';

  // OTLP endpoint configuration
  const rawEndpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'localhost:4317';
  // Remove any protocol prefix for consistent handling
  const otlpEndpoint = rawEndpoint.replace(/^https?:\/\//, '');
  const isInsecure = process.env.OTEL_EXPORTER_OTLP_INSECURE === 'true';

  console.log(`🔭 Initializing OpenTelemetry tracing...`);
  console.log(
    `   Service: ${serviceName} v${serviceVersion} | Env: ${environment}`
  );
  console.log(`   OTLP Endpoint: ${otlpEndpoint} (insecure: ${isInsecure})`);

  // Define the resource (service identity)
  const resource = resourcesModule.resourceFromAttributes({
    [SEMRESATTRS_SERVICE_NAME]: serviceName,
    [SEMRESATTRS_SERVICE_VERSION]: serviceVersion,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: environment,
    'service.namespace': 'emergent',
  });

  // Configure trace exporter (HTTP) for simpler setup
  // HTTP endpoint is typically port 4318 with /v1/traces path
  const httpEndpoint = otlpEndpoint.replace(':4317', ':4318');
  const traceExporter = new OTLPTraceExporter({
    url: `http://${httpEndpoint}/v1/traces`,
  });

  // Optional console exporter for development debugging
  // Enable with OTEL_CONSOLE_DEBUG=true for immediate local trace visibility
  const consoleDebugEnabled = process.env.OTEL_CONSOLE_DEBUG === 'true';

  // Use SimpleSpanProcessor in development for immediate trace export
  const isDev = environment === 'development';

  // Build span processors - OTLP exporter always, console optionally
  const spanProcessors = [];

  // Add console exporter first if enabled (for immediate debugging)
  if (consoleDebugEnabled) {
    console.log('   Console span debugging enabled (OTEL_CONSOLE_DEBUG=true)');
    spanProcessors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  }

  // Add OTLP exporter - Use BatchSpanProcessor in both dev and prod
  // Note: We previously used SimpleSpanProcessor in dev for immediate export, but
  // switched to BatchSpanProcessor to investigate HTTP span timing issues.
  // BatchSpanProcessor buffers spans before export, which may help with race conditions.
  const otlpProcessor = new BatchSpanProcessor(traceExporter, {
    maxQueueSize: 2048,
    maxExportBatchSize: 512,
    // In dev: shorter delay for faster feedback (100ms vs 1000ms in prod)
    scheduledDelayMillis: isDev ? 100 : 1000,
    exportTimeoutMillis: 30000,
  });
  spanProcessors.push(otlpProcessor);

  // Configure sampling rate
  // In production: sample 10% to reduce overhead and SigNoz data volume
  // In development: sample 100% for full visibility
  // Override with OTEL_SAMPLING_RATE env var (0.0 to 1.0)
  const defaultSamplingRate = isDev ? 1.0 : 0.1;
  const samplingRate = process.env.OTEL_SAMPLING_RATE
    ? parseFloat(process.env.OTEL_SAMPLING_RATE)
    : defaultSamplingRate;
  const sampler = new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(samplingRate),
  });
  console.log(`   Sampling rate: ${samplingRate * 100}%`);

  // Create explicit HttpInstrumentation instance with our config
  // Note: Passing HTTP config through getNodeAutoInstrumentations doesn't work reliably,
  // so we create an explicit instance and disable HTTP in auto-instrumentations
  console.log('[tracing.ts] About to create HttpInstrumentation...');
  console.log(
    `[tracing.ts] http in require.cache BEFORE creation: ${!!require.cache[
      require.resolve('http')
    ]}`
  );

  const httpInstrumentation = new HttpInstrumentation({
    // CRITICAL: Only create outgoing HTTP spans if there's a parent span
    // This prevents orphaned HTTP client spans when making external calls
    requireParentforOutgoingSpans: true,
    ignoreIncomingRequestHook: (req) => {
      const url = req.url || '';
      // Ignore health checks, metrics, and static assets
      const shouldIgnore =
        url.includes('/health') ||
        url.includes('/ready') ||
        url.includes('/metrics') ||
        url.includes('/favicon') ||
        url.includes('/.well-known');
      if (consoleDebugEnabled) {
        console.log(
          `[OTEL HTTP] ignoreIncomingRequestHook: url=${url}, ignored=${shouldIgnore}`
        );
      }
      return shouldIgnore;
    },
    ignoreOutgoingRequestHook: (req) => {
      const hostname = req.hostname || req.host || '';
      // Ignore OTEL collector health checks
      return hostname.includes('localhost:13133');
    },
    // Hook for when an INCOMING request span is started
    startIncomingSpanHook: (request) => {
      if (consoleDebugEnabled) {
        console.log(
          `[OTEL HTTP] startIncomingSpanHook: ${request.method} ${request.url}`
        );
      }
      return {};
    },
    // Hook for when an OUTGOING request span is started
    startOutgoingSpanHook: (request) => {
      if (consoleDebugEnabled) {
        const options = request as any;
        console.log(
          `[OTEL HTTP] startOutgoingSpanHook: ${options.method || 'GET'} ${
            options.hostname || options.host
          }${options.path || ''}`
        );
      }
      return {};
    },
    requestHook: (span, request) => {
      // Debug: Log span creation
      if (consoleDebugEnabled) {
        const spanContext = span.spanContext();
        console.log(`[OTEL HTTP] requestHook called:`);
        console.log(`  traceId: ${spanContext.traceId}`);
        console.log(`  spanId: ${spanContext.spanId}`);
        console.log(`  spanName: ${(span as any).name || 'unknown'}`);
      }
      // Add useful request attributes
      if ('headers' in request) {
        const headers = request.headers as Record<
          string,
          string | string[] | undefined
        >;
        if (headers['x-request-id']) {
          span.setAttribute('http.request_id', String(headers['x-request-id']));
        }
        if (headers['x-org-id']) {
          span.setAttribute('emergent.org_id', String(headers['x-org-id']));
        }
        if (headers['x-project-id']) {
          span.setAttribute(
            'emergent.project_id',
            String(headers['x-project-id'])
          );
        }
      }
    },
    responseHook: (span, response) => {
      // Debug: Log when HTTP span ends
      if (consoleDebugEnabled) {
        const spanContext = span.spanContext();
        const statusCode =
          'statusCode' in response ? response.statusCode : 'unknown';
        console.log(`[OTEL HTTP] responseHook called:`);
        console.log(`  traceId: ${spanContext.traceId}`);
        console.log(`  spanId: ${spanContext.spanId}`);
        console.log(`  statusCode: ${statusCode}`);
      }
    },
  });

  console.log('[tracing.ts] HttpInstrumentation created');
  console.log(
    `[tracing.ts] http in require.cache AFTER creation: ${!!require.cache[
      require.resolve('http')
    ]}`
  );
  console.log(
    `[tracing.ts] httpInstrumentation.isEnabled(): ${
      (httpInstrumentation as any)._enabled
    }`
  );

  // Create explicit PgInstrumentation with requireParentSpan
  // This ensures DB spans only appear under HTTP parent spans, not as orphaned root spans
  const pgInstrumentation = new PgInstrumentation({
    requireParentSpan: true,
    enhancedDatabaseReporting: true,
  });

  // Get auto-instrumentations for NestJS, Express, etc.
  // We create explicit HttpInstrumentation and PgInstrumentation to customize their behavior,
  // then use auto-instrumentations for everything else (with HTTP and pg disabled to avoid conflict)
  console.log(
    '[tracing.ts] Creating explicit HttpInstrumentation with hooks...'
  );

  // Debug: Log the config to verify hooks are present
  const httpConfig = httpInstrumentation.getConfig() as any;
  console.log(`[tracing.ts] HttpInstrumentation config check:`);
  console.log(`  - enabled: ${httpConfig?.enabled !== false}`);
  console.log(
    `  - ignoreIncomingRequestHook: ${typeof httpConfig?.ignoreIncomingRequestHook}`
  );
  console.log(
    `  - startIncomingSpanHook: ${typeof httpConfig?.startIncomingSpanHook}`
  );
  console.log(
    `  - startOutgoingSpanHook: ${typeof httpConfig?.startOutgoingSpanHook}`
  );
  console.log(`  - requestHook: ${typeof httpConfig?.requestHook}`);
  console.log(`  - responseHook: ${typeof httpConfig?.responseHook}`);
  console.log(
    `  - requireParentforOutgoingSpans: ${httpConfig?.requireParentforOutgoingSpans}`
  );

  const autoInstrumentations = getNodeAutoInstrumentations({
    // Disable HTTP in auto-instrumentations since we configure it explicitly above
    '@opentelemetry/instrumentation-http': { enabled: false },
    // Disable pg in auto-instrumentations since we configure it explicitly above with requireParentSpan
    '@opentelemetry/instrumentation-pg': { enabled: false },
    // Disable noisy/unnecessary instrumentations
    '@opentelemetry/instrumentation-fs': { enabled: false },
    '@opentelemetry/instrumentation-dns': { enabled: false },
    // Configure Express instrumentation to handle SSE endpoints properly.
    // SSE endpoints keep responses open, causing "request handler" spans to never end.
    // This results in "missing span" errors in SigNoz. We ignore SSE routes at the
    // request_handler level - HTTP and controller spans still provide visibility.
    '@opentelemetry/instrumentation-express': {
      ignoreLayers: [
        // SSE/Streaming endpoints - long-lived connections cause orphaned spans
        // Each pattern matches routes that use text/event-stream responses
        /\/events\/stream/, // EventsController - real-time entity updates
        /\/chat\/.*\/stream/, // ChatController - GET :id/stream
        /\/chat\/stream/, // ChatController - POST stream
        /\/chat-ui\//, // ChatUiController - all routes use streaming
        /\/chat-sdk\//, // ChatSdkController - all routes use streaming
        /\/template-packs\/studio\/.*\/chat/, // TemplatePackStudioController - session chat
        /\/objects\/.*\/refinement-chat/, // ObjectRefinementController - refinement chat
        /\/integrations\/.*\/sync\/stream/, // IntegrationsController - sync progress
        /\/tasks\/.*\/stream/, // TasksController - task streaming (if exists)
      ],
    },
    // Keep these enabled for rich traces:
    // - @opentelemetry/instrumentation-express (Express middleware/routes)
    // - @opentelemetry/instrumentation-nestjs-core (NestJS controllers/guards/pipes)
  });
  console.log(
    `[tracing.ts] Auto-instrumentations count: ${autoInstrumentations.length}`
  );

  sdk = new NodeSDK({
    resource,
    sampler,
    spanProcessors,
    // Use composite propagator for maximum interoperability:
    // - W3C TraceContext: Modern standard, works with most OTEL-compatible systems
    // - W3C Baggage: Propagates custom key-value pairs across services
    // - B3: For compatibility with Zipkin and legacy systems
    textMapPropagator: new CompositePropagator({
      propagators: [
        new W3CTraceContextPropagator(),
        new W3CBaggagePropagator(),
        new B3Propagator({ injectEncoding: B3InjectEncoding.MULTI_HEADER }),
      ],
    }),
    // Use async local storage for context propagation
    contextManager: new AsyncLocalStorageContextManager(),
    // Combine explicit HTTP/Pg instrumentation with auto-instrumentations
    instrumentations: [
      httpInstrumentation,
      pgInstrumentation,
      ...autoInstrumentations,
    ],
  });

  // Debug: Log that our explicit instrumentations are included
  console.log(
    `[tracing.ts] SDK configured with ${
      2 + autoInstrumentations.length
    } instrumentations`
  );
  console.log(
    `[tracing.ts] First 3 instrumentations: httpInstrumentation, pgInstrumentation, ${
      autoInstrumentations[0]?.instrumentationName || 'unknown'
    }`
  );

  // NOTE: SDK is NOT started here - it must be started in main.ts BEFORE NestFactory.create()
  // This ensures HTTP module is patched before NestJS loads it

  console.log('🔭 OpenTelemetry SDK configured (not yet started)');
  console.log(
    `   Service: ${serviceName} | Endpoint: http://${httpEndpoint}/v1/traces`
  );

  // Configure logs export (if enabled)
  if (isLogsEnabled) {
    const logsUrl = `http://${httpEndpoint}/v1/logs`;
    console.log(`   Configuring logs exporter to: ${logsUrl}`);

    const logExporter = new OTLPLogExporter({
      url: logsUrl,
    });

    // Use SimpleLogRecordProcessor in dev for immediate export, BatchLogRecordProcessor in prod
    const logProcessor = isDev
      ? new SimpleLogRecordProcessor(logExporter)
      : new BatchLogRecordProcessor(logExporter, {
          maxQueueSize: 2048,
          maxExportBatchSize: 512,
          scheduledDelayMillis: 5000,
          exportTimeoutMillis: 30000,
        });

    // In 0.208.0, processors are passed to constructor
    loggerProvider = new LoggerProvider({
      resource,
      processors: [logProcessor],
    });

    // Register as global logger provider
    logs.setGlobalLoggerProvider(loggerProvider);

    console.log('✅ OpenTelemetry logs export initialized');
    console.log(`   Logs Endpoint: http://${httpEndpoint}/v1/logs`);
  }

  // Graceful shutdown handler
  // Track if shutdown has already been called to prevent double-shutdown
  let isShuttingDown = false;

  const shutdown = async (signal?: string) => {
    // Prevent multiple shutdown calls (e.g., from hot reload triggering multiple signals)
    if (isShuttingDown) {
      console.log(
        `🔭 OpenTelemetry shutdown already in progress, ignoring ${
          signal || 'signal'
        }`
      );
      return;
    }
    isShuttingDown = true;

    console.log(`🔭 Shutting down OpenTelemetry (${signal || 'manual'})...`);
    try {
      await loggerProvider?.shutdown();
      await sdk?.shutdown();
      console.log('✅ OpenTelemetry shut down successfully');
    } catch (error) {
      console.error('❌ Error shutting down OpenTelemetry:', error);
    }
  };

  // Register shutdown handlers - but only in production!
  // In development with hot reload (HMR/webpack), SIGINT/SIGTERM signals may be sent
  // when restarting the server, but the process doesn't actually exit. If we shut down
  // OTEL on these signals in dev, tracing stops working after any hot reload.
  // In production, we want graceful shutdown to flush pending spans.
  if (!isDev) {
    console.log('   Registering OTEL shutdown handlers (production mode)');
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('beforeExit', () => {
      if (!isShuttingDown) {
        shutdown('beforeExit');
      }
    });
  } else {
    console.log(
      '   Skipping OTEL shutdown handlers (development mode - HMR safe)'
    );
  }

  // Export SDK for testing/advanced usage
  (global as any).__OTEL_SDK__ = sdk;
}

// Export OTEL API for custom instrumentation
export {
  trace,
  SpanStatusCode,
  context,
  propagation,
} from '@opentelemetry/api';
export type { Span, SpanContext, Tracer } from '@opentelemetry/api';

// Export logs API for FileLogger integration
export { logs, SeverityNumber } from '@opentelemetry/api-logs';

// Export enabled status for conditional logic
export const isOtelEnabled = isEnabled;
export const isOtelLogsEnabled = isLogsEnabled;

// Export SDK instance for advanced usage
export const getOtelSdk = () => sdk;

// Export LoggerProvider for FileLogger integration
export const getOtelLoggerProvider = () => loggerProvider;

/**
 * Start the OpenTelemetry SDK.
 * MUST be called BEFORE NestFactory.create() to ensure HTTP module is patched.
 *
 * @example
 * ```typescript
 * import { startOtelSdk, isOtelEnabled } from './tracing';
 *
 * async function bootstrap() {
 *   if (isOtelEnabled) {
 *     await startOtelSdk();
 *   }
 *   const app = await NestFactory.create(AppModule);
 *   // ...
 * }
 * ```
 */
export async function startOtelSdk(): Promise<void> {
  if (!sdk) {
    console.log('⚠️ OpenTelemetry SDK not configured (OTEL_ENABLED=false)');
    return;
  }

  try {
    await sdk.start();
    console.log('✅ OpenTelemetry SDK started successfully');

    // Verify the global tracer provider is working
    const { trace } = await import('@opentelemetry/api');
    const tracer = trace.getTracer('test-tracer');
    const testSpan = tracer.startSpan('test-span');
    const spanContext = testSpan.spanContext();
    console.log(
      `   Verification: traceId=${spanContext.traceId}, spanId=${spanContext.spanId}`
    );
    console.log(
      `   TraceId valid: ${
        spanContext.traceId !== '00000000000000000000000000000000'
      }`
    );
    testSpan.end();
  } catch (error) {
    console.error('❌ Failed to start OpenTelemetry SDK:', error);
    throw error;
  }
}

/**
 * Start the OpenTelemetry SDK SYNCHRONOUSLY.
 * This is the preferred way to start the SDK because it ensures
 * HTTP module patching happens BEFORE any imports that load HTTP.
 *
 * Call this at the very top of main.ts, immediately after importing this module,
 * and BEFORE importing NestJS or any other HTTP-using modules.
 *
 * @example
 * ```typescript
 * import { startOtelSdkSync, isOtelEnabled } from './tracing';
 *
 * // Start SDK synchronously BEFORE other imports
 * if (isOtelEnabled) {
 *   startOtelSdkSync();
 * }
 *
 * // Now safe to import NestJS
 * import { NestFactory } from '@nestjs/core';
 * ```
 */
export function startOtelSdkSync(): void {
  if (!sdk) {
    console.log('⚠️ OpenTelemetry SDK not configured (OTEL_ENABLED=false)');
    return;
  }

  try {
    // DIAGNOSTIC: Check http module state BEFORE SDK.start()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const httpModule = require('http');
    const serverEmitBefore = httpModule.Server.prototype.emit
      .toString()
      .slice(0, 100);
    console.log(
      `[OTEL-diag] BEFORE SDK.start() - http.Server.prototype.emit starts with: "${serverEmitBefore}..."`
    );

    // sdk.start() returns a Promise, but we call it synchronously
    // The important thing is that the instrumentation registration happens synchronously
    // when we create the SDK (in the NodeSDK constructor), so HTTP is already patched
    sdk.start();
    console.log('✅ OpenTelemetry SDK started successfully (sync)');

    // DIAGNOSTIC: Check http module state AFTER SDK.start()
    const serverEmitAfter = httpModule.Server.prototype.emit
      .toString()
      .slice(0, 100);
    console.log(
      `[OTEL-diag] AFTER SDK.start() - http.Server.prototype.emit starts with: "${serverEmitAfter}..."`
    );

    // Check if emit was wrapped (should be different if patched)
    const wasPatched = serverEmitBefore !== serverEmitAfter;
    console.log(
      `[OTEL-diag] http.Server.prototype.emit was patched: ${wasPatched}`
    );

    // Also check http.request for outgoing
    const httpRequestStr = httpModule.request.toString().slice(0, 100);
    console.log(`[OTEL-diag] http.request starts with: "${httpRequestStr}..."`);

    // DIAGNOSTIC: Print the emit function source to see what was actually patched
    const emitSource = httpModule.Server.prototype.emit.toString();
    console.log(
      '[OTEL-diag] http.Server.prototype.emit SOURCE length:',
      emitSource.length
    );
    // Write full source to a file for inspection
    require('fs').writeFileSync('/tmp/emit-source.js', emitSource);
    console.log('[OTEL-diag] Full emit source written to /tmp/emit-source.js');

    // DIAGNOSTIC: Check if there's an emit directly on Server (not prototype)
    const httpServer = new httpModule.Server();
    console.log(
      '[OTEL-diag] Server instance emit === prototype emit:',
      httpServer.emit === httpModule.Server.prototype.emit
    );
    console.log(
      '[OTEL-diag] Server instance emit length:',
      httpServer.emit.toString().length
    );
    require('fs').writeFileSync(
      '/tmp/emit-instance.js',
      httpServer.emit.toString()
    );
    httpServer.close();

    // Verify the global tracer provider is working
    // We use require here to avoid issues with dynamic import in sync context
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { trace } = require('@opentelemetry/api');
    const tracer = trace.getTracer('test-tracer');
    const testSpan = tracer.startSpan('test-span');
    const spanContext = testSpan.spanContext();
    console.log(
      `   Verification: traceId=${spanContext.traceId}, spanId=${spanContext.spanId}`
    );
    console.log(
      `   TraceId valid: ${
        spanContext.traceId !== '00000000000000000000000000000000'
      }`
    );
    testSpan.end();
  } catch (error) {
    console.error('❌ Failed to start OpenTelemetry SDK:', error);
    throw error;
  }
}

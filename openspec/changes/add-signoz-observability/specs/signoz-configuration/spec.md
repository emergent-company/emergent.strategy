# Capability: SigNoz Configuration

## ADDED Requirements

### Requirement: Environment Variable Configuration
The application MUST read SigNoz configuration from environment variables: SIGNOZ_ENABLED, SIGNOZ_OTLP_ENDPOINT, SIGNOZ_API_ENDPOINT, SIGNOZ_API_TOKEN, OTEL_SERVICE_NAME, OTEL_ENVIRONMENT.

#### Scenario: Configuration loaded from environment
```typescript
// Given: Environment variables set
process.env.SIGNOZ_ENABLED = 'true';
process.env.SIGNOZ_OTLP_ENDPOINT = 'http://localhost:4318';
process.env.SIGNOZ_API_ENDPOINT = 'http://localhost:3301';
process.env.SIGNOZ_API_TOKEN = 'test-token-123';
process.env.OTEL_SERVICE_NAME = 'spec-server';
process.env.OTEL_ENVIRONMENT = 'development';

// When: TelemetryModule initializes
const config = loadSigNozConfig();

// Then: Config reflects environment
expect(config).toMatchObject({
  enabled: true,
  otlpEndpoint: 'http://localhost:4318',
  apiEndpoint: 'http://localhost:3301',
  apiToken: 'test-token-123',
  serviceName: 'spec-server',
  environment: 'development',
});
```

#### Scenario: Default values when not configured
```typescript
// Given: Optional environment variables not set
delete process.env.OTEL_BATCH_INTERVAL_MS;
delete process.env.OTEL_MAX_QUEUE_SIZE;
delete process.env.OTEL_EXPORT_TIMEOUT_MS;

// When: Configuration loaded
const config = loadSigNozConfig();

// Then: Defaults applied
expect(config.batchInterval).toBe(5000);
expect(config.maxQueueSize).toBe(2048);
expect(config.exportTimeout).toBe(30000);
```

### Requirement: Feature Toggle
OpenTelemetry integration MUST be disabled when SIGNOZ_ENABLED=false, with no OTLP exports attempted and file-based logging continuing normally.

#### Scenario: SigNoz disabled via environment
```typescript
// Given: SigNoz disabled
process.env.SIGNOZ_ENABLED = 'false';

// When: Application starts
await bootstrap();

// Then: OpenTelemetry SDK not initialized
expect(TelemetryService.getInstance().isEnabled()).toBe(false);

// And: File logging works normally
logger.log('Test message', 'TestService');
const appLog = fs.readFileSync('logs/app.log', 'utf-8');
expect(appLog).toContain('[LOG] [TestService] Test message');
```

#### Scenario: SigNoz enabled via environment
```typescript
// Given: SigNoz enabled
process.env.SIGNOZ_ENABLED = 'true';
process.env.SIGNOZ_OTLP_ENDPOINT = 'http://localhost:4318';

// When: Application starts
await bootstrap();

// Then: OpenTelemetry SDK initialized
expect(TelemetryService.getInstance().isEnabled()).toBe(true);

// And: OTLP exports attempted
logger.log('Test message', 'TestService');
await sleep(5000); // Wait for batch export
const exportCalls = mockOTLPExporter.getCalls();
expect(exportCalls.length).toBeGreaterThan(0);
```

### Requirement: Validation and Startup Diagnostics
At startup, the application MUST validate SigNoz configuration and log diagnostic information: enabled status, OTLP endpoint, API endpoint, service name, environment.

#### Scenario: Valid configuration logs success
```typescript
// Given: Valid SigNoz configuration
process.env.SIGNOZ_ENABLED = 'true';
process.env.SIGNOZ_OTLP_ENDPOINT = 'http://localhost:4318';
process.env.SIGNOZ_API_ENDPOINT = 'http://localhost:3301';

// When: Application starts
await bootstrap();

// Then: Startup logs include diagnostics
const logs = captureStartupLogs();
expect(logs).toContain('[SigNoz] OpenTelemetry integration enabled');
expect(logs).toContain('[SigNoz] OTLP endpoint: http://localhost:4318');
expect(logs).toContain('[SigNoz] Service name: spec-server');
expect(logs).toContain('[SigNoz] Environment: development');
```

#### Scenario: Missing required configuration logs warning
```typescript
// Given: SIGNOZ_ENABLED=true but missing endpoint
process.env.SIGNOZ_ENABLED = 'true';
delete process.env.SIGNOZ_OTLP_ENDPOINT;

// When: Application starts
await bootstrap();

// Then: Warning logged and SigNoz disabled
const logs = captureStartupLogs();
expect(logs).toContain('[SigNoz] Missing required configuration: SIGNOZ_OTLP_ENDPOINT');
expect(logs).toContain('[SigNoz] OpenTelemetry integration disabled');
```

### Requirement: Resource Attributes
OpenTelemetry Resource MUST include standard attributes: service.name, service.version, deployment.environment, host.name, process.pid.

#### Scenario: Resource attributes set
```typescript
// Given: Application starts with SigNoz enabled
process.env.SIGNOZ_ENABLED = 'true';
process.env.OTEL_SERVICE_NAME = 'spec-server';
process.env.OTEL_ENVIRONMENT = 'production';

// When: OpenTelemetry SDK initializes
await bootstrap();

// Then: Resource includes attributes
const resource = TelemetryService.getInstance().getResource();
expect(resource.attributes).toMatchObject({
  'service.name': 'spec-server',
  'service.version': expect.stringMatching(/^\d+\.\d+\.\d+$/),
  'deployment.environment': 'production',
  'host.name': expect.any(String),
  'process.pid': process.pid,
});
```

### Requirement: OTLP Exporter Configuration
OTLP exporters MUST be configured with correct endpoints: /v1/logs, /v1/traces, /v1/metrics relative to SIGNOZ_OTLP_ENDPOINT.

#### Scenario: OTLP endpoints constructed correctly
```typescript
// Given: OTLP base endpoint configured
process.env.SIGNOZ_OTLP_ENDPOINT = 'http://localhost:4318';

// When: Exporters initialized
const telemetryService = TelemetryService.getInstance();

// Then: Exporters use correct URLs
expect(telemetryService.getLogExporter().url).toBe('http://localhost:4318/v1/logs');
expect(telemetryService.getTraceExporter().url).toBe('http://localhost:4318/v1/traces');
expect(telemetryService.getMetricExporter().url).toBe('http://localhost:4318/v1/metrics');
```

### Requirement: Graceful Shutdown
On application shutdown (SIGTERM, SIGINT), the OpenTelemetry SDK MUST flush pending batches and shutdown cleanly within 5 seconds.

#### Scenario: Graceful shutdown flushes batches
```typescript
// Given: Logs/traces/metrics pending in batches
logger.log('Test log 1', 'TestService');
logger.log('Test log 2', 'TestService');

// When: Application receives SIGTERM
process.emit('SIGTERM');

// Then: Pending batches exported before shutdown
await waitForShutdown();
const exportCalls = mockOTLPExporter.getCalls();
expect(exportCalls.length).toBeGreaterThan(0);
```

#### Scenario: Shutdown timeout
```typescript
// Given: OTLP exporter hangs
mockOTLPExporter.export.mockImplementation(() => new Promise(() => {})); // Never resolves

// When: Application receives SIGTERM
const shutdownStart = Date.now();
process.emit('SIGTERM');
await waitForShutdown();
const shutdownDuration = Date.now() - shutdownStart;

// Then: Shutdown completes within timeout
expect(shutdownDuration).toBeLessThan(5000);
```

### Requirement: Circuit Breaker Configuration
Circuit breaker MUST be configurable via environment: SIGNOZ_CIRCUIT_BREAKER_THRESHOLD (default: 3), SIGNOZ_CIRCUIT_BREAKER_RESET_TIMEOUT (default: 60000ms).

#### Scenario: Circuit breaker threshold configurable
```typescript
// Given: Custom circuit breaker threshold
process.env.SIGNOZ_CIRCUIT_BREAKER_THRESHOLD = '5';

// When: Exporter fails repeatedly
for (let i = 0; i < 5; i++) {
  mockOTLPExporter.export.mockRejectedValueOnce(new Error('Connection refused'));
  logger.log(`Test log ${i}`, 'TestService');
  await sleep(5000);
}

// Then: Circuit opens after 5 failures
const logs = captureLogs();
expect(logs).toContain('[SigNoz] Circuit breaker opened after 5 consecutive failures');
```

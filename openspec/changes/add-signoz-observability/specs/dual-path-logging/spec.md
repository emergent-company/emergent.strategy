# Capability: Dual-Path Logging

## ADDED Requirements

### Requirement: Synchronous File Logging
File writes MUST complete synchronously before OTLP export is attempted, ensuring file logs are never delayed or lost due to OTLP failures.

#### Scenario: File write completes before OTLP export
```typescript
// Given: Logger configured with dual-path
const logger = new FileLogger();
const writeStart = Date.now();

// When: Log message written
logger.log('Test message', 'TestService');
const writeEnd = Date.now();

// Then: File write completes quickly
expect(writeEnd - writeStart).toBeLessThan(10); // <10ms

// And: File contains message immediately
const appLog = fs.readFileSync('logs/app.log', 'utf-8');
expect(appLog).toContain('[LOG] [TestService] Test message');

// And: OTLP export happens asynchronously
await sleep(100); // OTLP export still pending in background
```

#### Scenario: OTLP export failure does not affect file logging
```typescript
// Given: OTLP exporter will fail
mockOTLPExporter.export.mockRejectedValue(new Error('Connection refused'));

// When: Log message written
logger.log('Test message', 'TestService');

// Then: File write succeeds
const appLog = fs.readFileSync('logs/app.log', 'utf-8');
expect(appLog).toContain('[LOG] [TestService] Test message');

// And: OTLP error logged but not thrown
await sleep(5000); // Wait for batch export
const errorLog = fs.readFileSync('logs/errors.log', 'utf-8');
expect(errorLog).toContain('[SigNoz] OTLP export failed: Connection refused');
```

### Requirement: Async OTLP Export
OTLP log export MUST be asynchronous and non-blocking, using BatchLogRecordProcessor with configurable batch size and interval.

#### Scenario: OTLP export batches multiple logs
```typescript
// Given: Batch interval set to 5 seconds
process.env.OTEL_BATCH_INTERVAL_MS = '5000';
process.env.OTEL_MAX_EXPORT_BATCH_SIZE = '512';

// When: Multiple logs written quickly
for (let i = 0; i < 10; i++) {
  logger.log(`Test message ${i}`, 'TestService');
}

// Then: OTLP exporter called once with batch
await sleep(5000);
const exportCalls = mockOTLPExporter.getCalls();
expect(exportCalls.length).toBe(1);
expect(exportCalls[0].logRecords.length).toBe(10);
```

#### Scenario: OTLP export does not block subsequent logs
```typescript
// Given: OTLP export takes 1 second
mockOTLPExporter.export.mockImplementation(() => sleep(1000));

// When: Logs written rapidly
const start = Date.now();
for (let i = 0; i < 100; i++) {
  logger.log(`Test message ${i}`, 'TestService');
}
const end = Date.now();

// Then: All logs written quickly
expect(end - start).toBeLessThan(100); // <100ms for 100 logs

// And: OTLP export happens in background
await sleep(5000);
const exportCalls = mockOTLPExporter.getCalls();
expect(exportCalls.length).toBeGreaterThan(0);
```

### Requirement: Exception Handling
OTLP export errors MUST be caught and logged to errors.log, never propagating to application code or affecting file logging.

#### Scenario: OTLP exception caught and logged
```typescript
// Given: OTLP exporter throws exception
mockOTLPExporter.export.mockRejectedValue(new Error('Network timeout'));

// When: Log written
logger.log('Test message', 'TestService');

// Then: Exception does not propagate
expect(() => logger.log('Test message', 'TestService')).not.toThrow();

// And: Error logged to errors.log
await sleep(5000);
const errorLog = fs.readFileSync('logs/errors.log', 'utf-8');
expect(errorLog).toContain('[SigNoz] OTLP export failed: Network timeout');
```

#### Scenario: Multiple OTLP failures do not crash application
```typescript
// Given: OTLP exporter consistently failing
mockOTLPExporter.export.mockRejectedValue(new Error('Connection refused'));

// When: Many logs written over time
for (let i = 0; i < 100; i++) {
  logger.log(`Test message ${i}`, 'TestService');
  await sleep(100);
}

// Then: Application continues running
expect(process.exitCode).toBeUndefined();

// And: File logs contain all messages
const appLog = fs.readFileSync('logs/app.log', 'utf-8');
for (let i = 0; i < 100; i++) {
  expect(appLog).toContain(`Test message ${i}`);
}
```

### Requirement: Circuit Breaker Pattern
After 3 consecutive OTLP export failures, the circuit breaker MUST open, preventing further export attempts for 60 seconds before retry.

#### Scenario: Circuit opens after threshold
```typescript
// Given: OTLP exporter failing
mockOTLPExporter.export.mockRejectedValue(new Error('Connection refused'));

// When: Threshold failures occur
for (let i = 0; i < 3; i++) {
  logger.log(`Test log ${i}`, 'TestService');
  await sleep(5000); // Wait for batch export
}

// Then: Circuit breaker opens
const logs = captureLogs();
expect(logs).toContain('[SigNoz] Circuit breaker opened after 3 consecutive failures');

// And: Subsequent exports skipped
logger.log('After circuit open', 'TestService');
await sleep(5000);
const exportCalls = mockOTLPExporter.getCalls();
expect(exportCalls.length).toBe(3); // No new calls
```

#### Scenario: Circuit resets after timeout
```typescript
// Given: Circuit breaker opened
openCircuitBreaker();

// When: Reset timeout elapses
await sleep(60000);

// Then: Export attempted again
logger.log('After reset', 'TestService');
await sleep(5000);
const logs = captureLogs();
expect(logs).toContain('[SigNoz] Circuit breaker attempting reconnection');
```

### Requirement: Health Monitoring
SigNoz connection status MUST be tracked and logged: successful exports, failed exports, circuit breaker state, pending queue size.

#### Scenario: Successful export logs health
```typescript
// Given: OTLP exporter working
mockOTLPExporter.export.mockResolvedValue({ code: 0 });

// When: Logs exported
logger.log('Test message', 'TestService');
await sleep(5000);

// Then: Health status logged
const logs = captureLogs();
expect(logs).toContain('[SigNoz] Successfully exported 1 log records');
```

#### Scenario: Failed export logs health
```typescript
// Given: OTLP exporter failing
mockOTLPExporter.export.mockRejectedValue(new Error('Timeout'));

// When: Export attempted
logger.log('Test message', 'TestService');
await sleep(5000);

// Then: Failure logged
const errorLog = fs.readFileSync('logs/errors.log', 'utf-8');
expect(errorLog).toContain('[SigNoz] OTLP export failed: Timeout');
expect(errorLog).toContain('[SigNoz] Circuit breaker failure count: 1/3');
```

### Requirement: Queue Management
OTLP export queue MUST be bounded (default: 2048 records) to prevent memory exhaustion during extended outages.

#### Scenario: Queue respects max size
```typescript
// Given: Queue max size set to 100
process.env.OTEL_MAX_QUEUE_SIZE = '100';

// And: OTLP exporter hanging (circuit open)
openCircuitBreaker();

// When: Many logs written
for (let i = 0; i < 200; i++) {
  logger.log(`Test log ${i}`, 'TestService');
}

// Then: Only latest logs queued
await sleep(5000);
const queueSize = TelemetryService.getInstance().getQueueSize();
expect(queueSize).toBeLessThanOrEqual(100);
```

#### Scenario: Queue drops oldest when full
```typescript
// Given: Queue at max capacity
process.env.OTEL_MAX_QUEUE_SIZE = '10';
openCircuitBreaker();
for (let i = 0; i < 10; i++) {
  logger.log(`Old log ${i}`, 'TestService');
}

// When: New log written
logger.log('New log', 'TestService');

// Then: Oldest log dropped
const logs = captureLogs();
expect(logs).toContain('[SigNoz] Queue full, dropping oldest log record');
```

### Requirement: Startup Connection Test
At startup, the application MUST attempt a test OTLP export to validate connectivity and log the result.

#### Scenario: Startup connection success
```typescript
// Given: SigNoz available
mockOTLPExporter.export.mockResolvedValue({ code: 0 });

// When: Application starts
await bootstrap();

// Then: Connection test logged
const logs = captureStartupLogs();
expect(logs).toContain('[SigNoz] Connection test successful');
expect(logs).toContain('[SigNoz] OTLP endpoint reachable: http://localhost:4318');
```

#### Scenario: Startup connection failure
```typescript
// Given: SigNoz unavailable
mockOTLPExporter.export.mockRejectedValue(new Error('ECONNREFUSED'));

// When: Application starts
await bootstrap();

// Then: Connection failure logged but app starts
const logs = captureStartupLogs();
expect(logs).toContain('[SigNoz] Connection test failed: ECONNREFUSED');
expect(logs).toContain('[SigNoz] Application will continue with file-based logging only');
expect(process.exitCode).toBeUndefined(); // App still starts
```

# Capability: OpenTelemetry Logging

## ADDED Requirements

### Requirement: Dual-Path Log Emission
The FileLogger service MUST emit logs to both the file system AND the OpenTelemetry LoggerProvider simultaneously, ensuring that logs are captured in files even if OpenTelemetry export fails.

#### Scenario: File write succeeds, OTLP export fails
```typescript
// Given: SigNoz is unavailable (HTTP 503)
// When: Application logs error
logger.error('Database connection failed', 'DatabaseService');

// Then: File system receives log entry
const appLog = fs.readFileSync('logs/app.log', 'utf-8');
expect(appLog).toContain('[ERROR] [DatabaseService] Database connection failed');

// And: OTLP export fails gracefully (no exception thrown)
// And: Application continues to function normally
```

#### Scenario: Both file and OTLP succeed
```typescript
// Given: SigNoz is available
// When: Application logs info
logger.log('User authenticated successfully', 'AuthService');

// Then: File system receives log entry
const appLog = fs.readFileSync('logs/app.log', 'utf-8');
expect(appLog).toContain('[LOG] [AuthService] User authenticated successfully');

// And: SigNoz receives log via OTLP
const signozLogs = await querySignozLogs({ service: 'spec-server', query: 'User authenticated' });
expect(signozLogs).toHaveLength(1);
expect(signozLogs[0].body).toBe('User authenticated successfully');
```

### Requirement: Structured Log Attributes
Each log record emitted to OpenTelemetry MUST include structured attributes: service name, log level, context, file path, line number, method name (when available), and trace context (when available).

#### Scenario: Log with full context
```typescript
// Given: Active trace span exists
const tracer = trace.getTracer('test');
await tracer.startActiveSpan('testOperation', async (span) => {
  // When: Log is emitted
  logger.warn('Resource usage high', 'MonitoringService');
  span.end();
});

// Then: SigNoz receives log with attributes
const logs = await querySignozLogs({ query: 'Resource usage high' });
expect(logs[0].attributes).toMatchObject({
  'service.name': 'spec-server',
  'log.level': 'warn',
  'log.context': 'MonitoringService',
  'log.file': 'src/modules/monitoring/monitoring.service.ts',
  'log.line': expect.any(Number),
  'log.method': 'MonitoringService.checkResourceUsage',
  'trace_id': expect.stringMatching(/^[0-9a-f]{32}$/),
  'span_id': expect.stringMatching(/^[0-9a-f]{16}$/),
});
```

#### Scenario: Log without trace context
```typescript
// Given: No active trace span
// When: Log is emitted
logger.info('Server started', 'Bootstrap');

// Then: SigNoz receives log with attributes (no trace IDs)
const logs = await querySignozLogs({ query: 'Server started' });
expect(logs[0].attributes).toMatchObject({
  'service.name': 'spec-server',
  'log.level': 'info',
  'log.context': 'Bootstrap',
  'log.file': 'src/main.ts',
  'log.line': expect.any(Number),
});
expect(logs[0].attributes).not.toHaveProperty('trace_id');
expect(logs[0].attributes).not.toHaveProperty('span_id');
```

### Requirement: Batch Export Configuration
OpenTelemetry LoggerProvider MUST be configured with BatchLogRecordProcessor that batches logs with a 5-second interval or 512-record threshold (whichever comes first) to minimize network overhead.

#### Scenario: Time-based batch trigger
```typescript
// Given: 100 logs emitted within 5 seconds
for (let i = 0; i < 100; i++) {
  logger.log(`Test log ${i}`, 'TestService');
}

// When: 5 seconds elapse
await sleep(5000);

// Then: All 100 logs exported in single batch
const exportCalls = mockOTLPExporter.getCalls();
expect(exportCalls).toHaveLength(1);
expect(exportCalls[0].logRecords).toHaveLength(100);
```

#### Scenario: Count-based batch trigger
```typescript
// Given: 512 logs emitted rapidly
for (let i = 0; i < 512; i++) {
  logger.log(`Test log ${i}`, 'TestService');
}

// Then: Batch export triggered immediately (before 5s timeout)
const exportCalls = mockOTLPExporter.getCalls();
expect(exportCalls).toHaveLength(1);
expect(exportCalls[0].logRecords).toHaveLength(512);
```

### Requirement: Log Level Mapping
Log levels MUST be mapped to OpenTelemetry severity numbers according to the spec: DEBUG=5, INFO=9, WARN=13, ERROR=17, FATAL=21.

#### Scenario: Correct severity mapping
```typescript
// When: Different log levels are used
logger.debug('Debug message', 'TestService');
logger.log('Info message', 'TestService');
logger.warn('Warning message', 'TestService');
logger.error('Error message', 'TestService');
logger.fatal('Fatal message', 'TestService');

// Then: SigNoz receives logs with correct severity numbers
const logs = await querySignozLogs({ service: 'spec-server' });
expect(logs.find(l => l.body === 'Debug message').severityNumber).toBe(5);
expect(logs.find(l => l.body === 'Info message').severityNumber).toBe(9);
expect(logs.find(l => l.body === 'Warning message').severityNumber).toBe(13);
expect(logs.find(l => l.body === 'Error message').severityNumber).toBe(17);
expect(logs.find(l => l.body === 'Fatal message').severityNumber).toBe(21);
```

### Requirement: Graceful Failure Handling
If OpenTelemetry log export fails, the FileLogger MUST NOT throw exceptions or interrupt application execution; file-based logging MUST continue normally.

#### Scenario: OTLP export failure with exception suppression
```typescript
// Given: OTLP exporter throws error
mockOTLPExporter.export.mockRejectedValue(new Error('Connection refused'));

// When: Logs are emitted
logger.error('Database query failed', 'DatabaseService');
logger.warn('Retrying connection', 'DatabaseService');

// Then: No exceptions propagate to application
// And: File logging succeeds
const appLog = fs.readFileSync('logs/app.log', 'utf-8');
expect(appLog).toContain('[ERROR] [DatabaseService] Database query failed');
expect(appLog).toContain('[WARN] [DatabaseService] Retrying connection');
```

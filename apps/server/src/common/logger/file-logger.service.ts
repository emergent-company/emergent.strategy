import { LoggerService, LogLevel } from '@nestjs/common';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { resolveLogDir } from './log-path.util';
import {
  SeverityNumber,
  isOtelLogsEnabled,
  getOtelLoggerProvider,
} from '../../tracing';
import { trace } from '@opentelemetry/api';

/**
 * Caller location information extracted from stack trace
 */
interface CallerInfo {
  file: string; // Relative file path from project root
  line: number; // Line number
  column: number; // Column number
  method?: string; // Method/function name if available
}

/**
 * Map NestJS log levels to OpenTelemetry severity numbers
 * https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-severitynumber
 */
const SEVERITY_MAP: Record<string, SeverityNumber> = {
  verbose: SeverityNumber.DEBUG,
  debug: SeverityNumber.DEBUG,
  log: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
  fatal: SeverityNumber.FATAL,
};

/**
 * Custom File Logger for NestJS
 *
 * Logs all messages to files with categorization:
 * - logs/server/server.log: All log levels (INFO+) - main application log
 * - logs/server/server.error.log: Only error and fatal messages
 * - logs/server/server.debug.log: Debug and verbose messages (development only)
 *
 * Automatically includes:
 * - ISO timestamp
 * - File path and line number where log was called
 * - Context (service/controller name)
 * - Log level
 */
export class FileLogger implements LoggerService {
  private logDir: string;
  private appLogPath: string;
  private errorLogPath: string;
  private debugLogPath: string;
  private isDevelopment: boolean;
  private isTest: boolean;
  private projectRoot: string;
  // Debug flags for OTEL logging - only log once
  private _otelDisabledLogged = false;
  private _otelEmitLogged = false;

  constructor() {
    const baseLogDir = resolveLogDir();
    // Server logs go in server/ subdirectory
    this.logDir = join(baseLogDir, 'server');
    this.isDevelopment = process.env.NODE_ENV === 'development';
    this.isTest = process.env.NODE_ENV === 'test';
    this.projectRoot = process.cwd();

    // Create logs/server directory if it doesn't exist
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
    }

    this.appLogPath = join(this.logDir, 'server.log');
    this.errorLogPath = join(this.logDir, 'server.error.log');
    this.debugLogPath = join(this.logDir, 'server.debug.log');
  }

  /**
   * Extract caller location from stack trace
   * Skips over logger internal calls to find the actual caller
   */
  private getCallerInfo(): CallerInfo {
    const stack = new Error().stack;
    if (!stack) {
      return { file: 'unknown', line: 0, column: 0 };
    }

    const lines = stack.split('\n');

    // Find the first stack frame that's NOT from this logger file
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i];

      // Skip logger internal calls
      if (line.includes('file-logger.service')) {
        continue;
      }

      // Skip node internal calls
      if (line.includes('node:internal') || line.includes('node_modules')) {
        continue;
      }

      // Extract file path, line, and column from stack frame
      // Format: "    at ClassName.methodName (/path/to/file.ts:123:45)"
      const match = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?/);

      if (match) {
        const method = match[1]?.trim();
        const filePath = match[2];
        const lineNum = parseInt(match[3], 10);
        const colNum = parseInt(match[4], 10);

        // Make path relative to project root for readability
        const relativePath = relative(this.projectRoot, filePath);

        return {
          file: relativePath.startsWith('..') ? filePath : relativePath,
          line: lineNum,
          column: colNum,
          method: method || undefined,
        };
      }
    }

    return { file: 'unknown', line: 0, column: 0 };
  }

  /**
   * Write log entry to file(s)
   */
  private writeToFile(
    level: LogLevel,
    message: string,
    context?: string,
    trace?: string
  ) {
    const timestamp = new Date().toISOString();
    const caller = this.getCallerInfo();
    const contextStr = context ? `[${context}]` : '[App]';

    // Build location string: file:line or file:line (method) if method is available
    const locationStr = caller.method
      ? `${caller.file}:${caller.line} (${caller.method})`
      : `${caller.file}:${caller.line}`;

    const logEntry = {
      timestamp,
      level,
      context: context || 'App',
      location: locationStr,
      file: caller.file,
      line: caller.line,
      ...(caller.method ? { method: caller.method } : {}),
      message: typeof message === 'object' ? JSON.stringify(message) : message,
      ...(trace ? { trace } : {}),
    };

    // Human-readable format: timestamp [LEVEL] [Context] location - message
    const formattedLog = `${timestamp} [${level.toUpperCase()}] ${contextStr} ${locationStr} - ${
      logEntry.message
    }${trace ? '\n' + trace : ''}\n`;

    try {
      // Always write to main app log
      appendFileSync(this.appLogPath, formattedLog, 'utf-8');

      // Write errors to dedicated error log
      if (level === 'error' || level === 'fatal') {
        appendFileSync(this.errorLogPath, formattedLog, 'utf-8');
      }

      // Write debug/verbose to debug log (dev only)
      if (this.isDevelopment && (level === 'debug' || level === 'verbose')) {
        appendFileSync(this.debugLogPath, formattedLog, 'utf-8');
      }
    } catch (err) {
      // Swallow file I/O errors to prevent logger from crashing the app
      console.error('FileLogger: Failed to write log:', err);
    }

    // Also emit to OpenTelemetry if logs export is enabled
    this.emitOtelLog(level, logEntry.message, context, caller, trace);
  }

  /**
   * Emit log to OpenTelemetry for export to SigNoz
   * This runs in parallel with file logging - failures are silently ignored
   */
  private emitOtelLog(
    level: LogLevel,
    message: string,
    context?: string,
    caller?: CallerInfo,
    stackTrace?: string
  ) {
    if (!isOtelLogsEnabled) {
      // Debug: Log once if OTEL logs are disabled
      if (!this._otelDisabledLogged) {
        console.log(
          '[FileLogger] OTEL logs disabled, isOtelLogsEnabled:',
          isOtelLogsEnabled
        );
        this._otelDisabledLogged = true;
      }
      return;
    }

    try {
      // Use the LoggerProvider directly to avoid global provider mismatch issues
      const loggerProvider = getOtelLoggerProvider();
      if (!loggerProvider) {
        return;
      }
      const logger = loggerProvider.getLogger('emergent-server');
      const activeSpan = trace.getActiveSpan();
      const spanContext = activeSpan?.spanContext();

      // Debug: Log first emit
      if (!this._otelEmitLogged) {
        console.log('[FileLogger] First OTEL log emit, logger:', !!logger);
        this._otelEmitLogged = true;
      }

      logger.emit({
        severityNumber: SEVERITY_MAP[level] || SeverityNumber.INFO,
        severityText: level.toUpperCase(),
        body: message,
        attributes: {
          'log.context': context || 'App',
          ...(caller?.file && { 'code.filepath': caller.file }),
          ...(caller?.line && { 'code.lineno': caller.line }),
          ...(caller?.method && { 'code.function': caller.method }),
          ...(stackTrace && { 'exception.stacktrace': stackTrace }),
          // Include trace context for correlation
          ...(spanContext && {
            trace_id: spanContext.traceId,
            span_id: spanContext.spanId,
          }),
        },
      });
    } catch {
      // Silently ignore OTEL errors - file logging is the primary path
    }
  }

  /**
   * Format timestamp for console output (HH:MM:SS.mmm)
   */
  private formatTime(): string {
    const now = new Date();
    return (
      now.toTimeString().split(' ')[0] +
      '.' +
      String(now.getMilliseconds()).padStart(3, '0')
    );
  }

  /**
   * Format a console log line with timestamp, context, and caller info
   */
  private formatConsole(
    message: any,
    context?: string,
    caller?: CallerInfo,
    prefix?: string
  ): string {
    const time = this.formatTime();
    const ctx = context || 'App';
    const loc = caller ? `${caller.file}:${caller.line}` : 'unknown';
    const pre = prefix ? `[${prefix}] ` : '';
    return `[${time}] ${pre}[${ctx}] ${loc} - ${message}`;
  }

  /**
   * Log a message
   */
  log(message: any, context?: string) {
    this.writeToFile('log', message, context);
    if (!this.isTest) {
      console.log(this.formatConsole(message, context, this.getCallerInfo()));
    }
  }

  /**
   * Log an error message
   */
  error(message: any, trace?: string, context?: string) {
    this.writeToFile('error', message, context, trace);
    if (!this.isTest) {
      console.error(this.formatConsole(message, context, this.getCallerInfo()));
      if (trace) console.error(trace);
    }
  }

  /**
   * Log a warning message
   */
  warn(message: any, context?: string) {
    this.writeToFile('warn', message, context);
    if (!this.isTest) {
      console.warn(this.formatConsole(message, context, this.getCallerInfo()));
    }
  }

  /**
   * Log a debug message
   */
  debug(message: any, context?: string) {
    this.writeToFile('debug', message, context);
    if (this.isDevelopment && !this.isTest) {
      console.debug(this.formatConsole(message, context, this.getCallerInfo()));
    }
  }

  /**
   * Log a verbose message
   */
  verbose(message: any, context?: string) {
    this.writeToFile('verbose', message, context);
    if (this.isDevelopment && !this.isTest) {
      console.log(
        this.formatConsole(message, context, this.getCallerInfo(), 'VERBOSE')
      );
    }
  }

  /**
   * Log a fatal error (critical failure)
   */
  fatal(message: any, trace?: string, context?: string) {
    this.writeToFile('fatal', message, context, trace);
    console.error(
      this.formatConsole(message, context, this.getCallerInfo(), 'FATAL')
    );
    if (trace) console.error(trace);
  }
}

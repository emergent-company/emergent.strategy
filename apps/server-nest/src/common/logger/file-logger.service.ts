import { LoggerService, LogLevel } from '@nestjs/common';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { resolveLogDir } from './log-path.util';

/**
 * Caller location information extracted from stack trace
 */
interface CallerInfo {
    file: string;      // Relative file path from project root
    line: number;      // Line number
    column: number;    // Column number
    method?: string;   // Method/function name if available
}

/**
 * Custom File Logger for NestJS
 * 
 * Logs all messages to files with rotation and categorization:
 * - logs/app.log: All log levels (verbose, debug, log, warn, error)
 * - logs/errors.log: Only error and fatal messages
 * - logs/debug.log: Debug and verbose messages (development only)
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

    constructor() {
        this.logDir = resolveLogDir();
        this.isDevelopment = process.env.NODE_ENV === 'development';
        this.isTest = process.env.NODE_ENV === 'test';
        this.projectRoot = process.cwd();

        // Create logs directory if it doesn't exist
        if (!existsSync(this.logDir)) {
            mkdirSync(this.logDir, { recursive: true });
        }

        this.appLogPath = join(this.logDir, 'app.log');
        this.errorLogPath = join(this.logDir, 'errors.log');
        this.debugLogPath = join(this.logDir, 'debug.log');
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
                    method: method || undefined
                };
            }
        }

        return { file: 'unknown', line: 0, column: 0 };
    }

    /**
     * Write log entry to file(s)
     */
    private writeToFile(level: LogLevel, message: string, context?: string, trace?: string) {
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
            ...(trace ? { trace } : {})
        };

        // Human-readable format: timestamp [LEVEL] [Context] location - message
        const formattedLog = `${timestamp} [${level.toUpperCase()}] ${contextStr} ${locationStr} - ${logEntry.message}${trace ? '\n' + trace : ''}\n`;

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
    }

    /**
     * Log a message
     */
    log(message: any, context?: string) {
        this.writeToFile('log', message, context);
        if (!this.isTest) {
            const caller = this.getCallerInfo();
            console.log(`[${context || 'App'}] ${caller.file}:${caller.line} - ${message}`);
        }
    }

    /**
     * Log an error message
     */
    error(message: any, trace?: string, context?: string) {
        this.writeToFile('error', message, context, trace);
        if (!this.isTest) {
            const caller = this.getCallerInfo();
            console.error(`[${context || 'App'}] ${caller.file}:${caller.line} - ${message}`);
            if (trace) console.error(trace);
        }
    }

    /**
     * Log a warning message
     */
    warn(message: any, context?: string) {
        this.writeToFile('warn', message, context);
        if (!this.isTest) {
            const caller = this.getCallerInfo();
            console.warn(`[${context || 'App'}] ${caller.file}:${caller.line} - ${message}`);
        }
    }

    /**
     * Log a debug message
     */
    debug(message: any, context?: string) {
        this.writeToFile('debug', message, context);
        if (this.isDevelopment && !this.isTest) {
            const caller = this.getCallerInfo();
            console.debug(`[${context || 'App'}] ${caller.file}:${caller.line} - ${message}`);
        }
    }

    /**
     * Log a verbose message
     */
    verbose(message: any, context?: string) {
        this.writeToFile('verbose', message, context);
        if (this.isDevelopment && !this.isTest) {
            const caller = this.getCallerInfo();
            console.log(`[VERBOSE] [${context || 'App'}] ${caller.file}:${caller.line} - ${message}`);
        }
    }

    /**
     * Log a fatal error (critical failure)
     */
    fatal(message: any, trace?: string, context?: string) {
        this.writeToFile('fatal', message, context, trace);
        const caller = this.getCallerInfo();
        console.error(`[FATAL] [${context || 'App'}] ${caller.file}:${caller.line} - ${message}`);
        if (trace) console.error(trace);
    }
}

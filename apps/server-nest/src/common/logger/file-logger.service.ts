import { LoggerService, LogLevel } from '@nestjs/common';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveLogDir } from './log-path.util';

/**
 * Custom File Logger for NestJS
 * 
 * Logs all messages to files with rotation and categorization:
 * - logs/app.log: All log levels (verbose, debug, log, warn, error)
 * - logs/errors.log: Only error and fatal messages
 * - logs/debug.log: Debug and verbose messages (development only)
 */
export class FileLogger implements LoggerService {
    private logDir: string;
    private appLogPath: string;
    private errorLogPath: string;
    private debugLogPath: string;
    private isDevelopment: boolean;
    private isTest: boolean;

    constructor() {
        this.logDir = resolveLogDir();
        this.isDevelopment = process.env.NODE_ENV === 'development';
        this.isTest = process.env.NODE_ENV === 'test';

        // Create logs directory if it doesn't exist
        if (!existsSync(this.logDir)) {
            mkdirSync(this.logDir, { recursive: true });
        }

        this.appLogPath = join(this.logDir, 'app.log');
        this.errorLogPath = join(this.logDir, 'errors.log');
        this.debugLogPath = join(this.logDir, 'debug.log');
    }

    /**
     * Write log entry to file(s)
     */
    private writeToFile(level: LogLevel, message: string, context?: string, trace?: string) {
        const timestamp = new Date().toISOString();
        const contextStr = context ? `[${context}]` : '[App]';

        const logEntry = {
            timestamp,
            level,
            context: context || 'App',
            message: typeof message === 'object' ? JSON.stringify(message) : message,
            ...(trace ? { trace } : {})
        };

        const formattedLog = `${timestamp} [${level.toUpperCase()}] ${contextStr} ${logEntry.message}${trace ? '\n' + trace : ''}\n`;

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
            console.log(message);
        }
    }

    /**
     * Log an error message
     */
    error(message: any, trace?: string, context?: string) {
        this.writeToFile('error', message, context, trace);
        if (!this.isTest) {
            console.error(message);
            if (trace) console.error(trace);
        }
    }

    /**
     * Log a warning message
     */
    warn(message: any, context?: string) {
        this.writeToFile('warn', message, context);
        if (!this.isTest) {
            console.warn(message);
        }
    }

    /**
     * Log a debug message
     */
    debug(message: any, context?: string) {
        this.writeToFile('debug', message, context);
        if (this.isDevelopment && !this.isTest) {
            console.debug(message);
        }
    }

    /**
     * Log a verbose message
     */
    verbose(message: any, context?: string) {
        this.writeToFile('verbose', message, context);
        if (this.isDevelopment && !this.isTest) {
            console.log(`[VERBOSE] ${message}`);
        }
    }

    /**
     * Log a fatal error (critical failure)
     */
    fatal(message: any, trace?: string, context?: string) {
        this.writeToFile('fatal', message, context, trace);
        console.error(`[FATAL] ${message}`);
        if (trace) console.error(trace);
    }
}

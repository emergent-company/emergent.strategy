/**
 * Browser Console Logger
 *
 * Captures console errors and logs them to a file via API endpoint.
 * This helps debug production issues and errors that only appear in the browser.
 */

import { getApiBase } from '@/lib/api-config';

interface LogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  extra?: Record<string, unknown>;
}

class ConsoleLogger {
  private buffer: LogEntry[] = [];
  private flushInterval: number = 5000; // 5 seconds
  private maxBufferSize: number = 50;
  private endpoint: string;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private enabled: boolean = true;

  constructor() {
    // Initialize endpoint with API base
    this.endpoint = `${getApiBase()}/api/logs/client`;

    if (typeof window === 'undefined') return;

    // Only enable in development or if explicitly enabled
    this.enabled =
      import.meta.env.DEV || import.meta.env.VITE_CLIENT_LOGGING === '1';

    if (!this.enabled) return;

    this.setupConsoleInterceptors();
    this.setupErrorHandlers();
    this.scheduleFlush();
  }

  private setupConsoleInterceptors() {
    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = (...args: unknown[]) => {
      this.log('error', args);
      originalError.apply(console, args);
    };

    console.warn = (...args: unknown[]) => {
      this.log('warn', args);
      originalWarn.apply(console, args);
    };
  }

  private setupErrorHandlers() {
    // Catch unhandled errors
    window.addEventListener('error', (event) => {
      this.log('error', [event.message], {
        stack: event.error?.stack,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.log('error', ['Unhandled Promise Rejection:', event.reason], {
        reason: event.reason,
      });
    });
  }

  private log(
    level: LogEntry['level'],
    args: unknown[],
    extra?: Record<string, unknown>
  ) {
    const message = args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.message;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(' ');

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      url: window.location.href,
      userAgent: navigator.userAgent,
      ...extra,
    };

    // Extract stack trace if available
    if (args.length > 0 && args[0] instanceof Error) {
      entry.stack = args[0].stack;
    }

    this.buffer.push(entry);

    // Flush if buffer is full
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  private scheduleFlush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    this.flushTimer = setTimeout(() => {
      this.flush();
      this.scheduleFlush();
    }, this.flushInterval);
  }

  private async flush() {
    if (this.buffer.length === 0) return;

    const logs = [...this.buffer];
    this.buffer = [];

    try {
      // Try to send logs to server
      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ logs }),
        // Don't send credentials for logging
        credentials: 'omit',
      });
    } catch (error) {
      // If sending fails, store in localStorage as fallback
      this.saveToLocalStorage(logs);
    }
  }

  private saveToLocalStorage(logs: LogEntry[]) {
    try {
      const key = `console_logs_${Date.now()}`;
      localStorage.setItem(key, JSON.stringify(logs));

      // Clean up old logs (keep only last 10)
      const allKeys = Object.keys(localStorage).filter((k) =>
        k.startsWith('console_logs_')
      );
      if (allKeys.length > 10) {
        const sorted = allKeys.sort();
        sorted.slice(0, -10).forEach((k) => localStorage.removeItem(k));
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  public destroy() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }

  /**
   * Manually log an entry
   */
  public logError(message: string, extra?: Record<string, unknown>) {
    this.log('error', [message], extra);
  }

  public logWarn(message: string, extra?: Record<string, unknown>) {
    this.log('warn', [message], extra);
  }

  public logInfo(message: string, extra?: Record<string, unknown>) {
    this.log('info', [message], extra);
  }

  /**
   * Export logs for debugging
   */
  public exportLogs(): LogEntry[] {
    return [...this.buffer];
  }

  /**
   * Clear all buffered logs
   */
  public clearLogs() {
    this.buffer = [];
  }
}

// Create singleton instance
export const consoleLogger = new ConsoleLogger();

// Cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    consoleLogger.destroy();
  });
}

// Export for debugging in console
if (typeof window !== 'undefined') {
  (window as any).__consoleLogger = consoleLogger;
}

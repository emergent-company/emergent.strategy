/**
 * Simple Browser Error Logger
 * 
 * Captures errors and API failures to localStorage for easy debugging.
 * View logs in console with: window.__errorLogs.getLogs()
 * Download logs with: window.__errorLogs.downloadLogs()
 */

interface ErrorLog {
  timestamp: string;
  type: 'console-error' | 'api-error' | 'unhandled-error' | 'network-error';
  message: string;
  stack?: string;
  url?: string;
  method?: string;
  status?: number;
  response?: unknown;
  extra?: Record<string, unknown>;
}

class BrowserErrorLogger {
  private readonly storageKey = 'app_error_logs';
  private readonly maxLogs = 100;
  private enabled: boolean;

  constructor() {
    // Enable in development or when explicitly enabled
    this.enabled = import.meta.env.DEV || localStorage.getItem('enable_error_logging') === '1';

    if (this.enabled) {
      this.setup();
    }
  }

  private setup() {
    // Intercept console.error
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      this.logError('console-error', args);
      originalError.apply(console, args);
    };

    // Catch unhandled errors
    window.addEventListener('error', (event) => {
      this.addLog({
        type: 'unhandled-error',
        message: event.message,
        stack: event.error?.stack,
        url: event.filename,
        extra: {
          line: event.lineno,
          col: event.colno,
        },
      });
    });

    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.addLog({
        type: 'unhandled-error',
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
        extra: {
          reason: event.reason,
        },
      });
    });

    console.log('[Error Logger] Enabled. View logs with: window.__errorLogs.getLogs()');
  }

  private logError(type: ErrorLog['type'], args: unknown[]) {
    const message = args
      .map(arg => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.message;
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      })
      .join(' ');

    const stack = args.find(arg => arg instanceof Error)?.stack;

    this.addLog({ type, message, stack });
  }

  public logApiError(url: string, method: string, status: number, response?: unknown) {
    this.addLog({
      type: 'api-error',
      message: `API Error: ${method} ${url} - ${status}`,
      url,
      method,
      status,
      response,
    });
  }

  public logNetworkError(url: string, method: string, error: Error) {
    this.addLog({
      type: 'network-error',
      message: `Network Error: ${method} ${url} - ${error.message}`,
      url,
      method,
      stack: error.stack,
    });
  }

  private addLog(log: Omit<ErrorLog, 'timestamp'>) {
    if (!this.enabled) return;

    const entry: ErrorLog = {
      timestamp: new Date().toISOString(),
      ...log,
    };

    try {
      const logs = this.getLogs();
      logs.unshift(entry); // Add to beginning

      // Keep only last maxLogs entries
      const trimmed = logs.slice(0, this.maxLogs);

      localStorage.setItem(this.storageKey, JSON.stringify(trimmed));
    } catch (error) {
      // Ignore storage errors
      console.warn('[Error Logger] Failed to save log:', error);
    }
  }

  public getLogs(): ErrorLog[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public clearLogs() {
    localStorage.removeItem(this.storageKey);
    console.log('[Error Logger] Logs cleared');
  }

  public downloadLogs() {
    const logs = this.getLogs();
    const content = JSON.stringify(logs, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error-logs-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log('[Error Logger] Logs downloaded');
  }

  public printLogs() {
    const logs = this.getLogs();
    console.table(
      logs.map(log => ({
        Time: new Date(log.timestamp).toLocaleString(),
        Type: log.type,
        Message: log.message.substring(0, 100),
        Status: log.status || '',
        URL: log.url || '',
      }))
    );
    console.log('[Error Logger] Full logs:', logs);
  }

  public enable() {
    this.enabled = true;
    localStorage.setItem('enable_error_logging', '1');
    console.log('[Error Logger] Enabled');
  }

  public disable() {
    this.enabled = false;
    localStorage.removeItem('enable_error_logging');
    console.log('[Error Logger] Disabled');
  }
}

// Create singleton
export const errorLogger = new BrowserErrorLogger();

// Expose to window for console access
if (typeof window !== 'undefined') {
  (window as any).__errorLogs = errorLogger;
}

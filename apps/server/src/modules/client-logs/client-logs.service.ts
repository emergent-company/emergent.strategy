import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveLogDir } from '../../common/logger/log-path.util';
import { ClientLogEntryDto } from './client-logs.dto';

/**
 * Service for writing browser client logs to file
 *
 * Writes client-side errors and warnings to logs/admin/admin.client.log
 */
@Injectable()
export class ClientLogsService implements OnModuleInit {
  private readonly logger = new Logger(ClientLogsService.name);
  private logDir: string;
  private clientLogPath: string;

  constructor() {
    const baseLogDir = resolveLogDir();
    // Client logs go in admin/ subdirectory since they come from the admin frontend
    this.logDir = join(baseLogDir, 'admin');
    this.clientLogPath = join(this.logDir, 'admin.client.log');
  }

  onModuleInit() {
    // Ensure log directory exists
    if (!existsSync(this.logDir)) {
      mkdirSync(this.logDir, { recursive: true });
      this.logger.log(`Created client logs directory: ${this.logDir}`);
    }
  }

  /**
   * Write batch of client log entries to file
   */
  writeLogs(logs: ClientLogEntryDto[]): { written: number } {
    let written = 0;

    for (const entry of logs) {
      try {
        const formattedLog = this.formatLogEntry(entry);
        appendFileSync(this.clientLogPath, formattedLog, 'utf-8');
        written++;
      } catch (err) {
        this.logger.error(`Failed to write client log: ${err}`);
      }
    }

    if (written > 0) {
      this.logger.debug(`Wrote ${written} client log entries`);
    }

    return { written };
  }

  /**
   * Format a log entry for file output
   */
  private formatLogEntry(entry: ClientLogEntryDto): string {
    const { timestamp, level, message, stack, url, userAgent, extra } = entry;

    // Build structured log line
    const parts = [timestamp, `[${level.toUpperCase()}]`, `[Browser]`];

    // Add URL path for context (strip origin)
    if (url) {
      try {
        const urlPath = new URL(url).pathname;
        parts.push(`[${urlPath}]`);
      } catch {
        parts.push(`[${url}]`);
      }
    }

    parts.push('-', message);

    let logLine = parts.join(' ');

    // Add stack trace on separate lines
    if (stack) {
      logLine += '\n' + stack;
    }

    // Add extra data as JSON if present
    if (extra && Object.keys(extra).length > 0) {
      logLine += '\n  Extra: ' + JSON.stringify(extra);
    }

    // Add user agent on errors for debugging browser-specific issues
    if (level === 'error' && userAgent) {
      logLine += '\n  UserAgent: ' + userAgent;
    }

    return logLine + '\n';
  }
}

/**
 * HTTP Request Logger Interceptor
 *
 * Logs all HTTP requests in Apache/Nginx-style format to a separate log file.
 * Format: IP METHOD PATH STATUS DURATION "USER-AGENT" [REQUEST_ID]
 *
 * Example:
 * 127.0.0.1 POST /api/projects 201 45ms "Mozilla/5.0..." [req-abc123]
 * 127.0.0.1 GET /api/documents?project_id=xyz 200 12ms "playwright/1.40.0" [req-def456]
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { resolveLogDir } from '../logger/log-path.util';

@Injectable()
export class HttpLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpLoggerInterceptor.name);
  private readonly httpLogPath: string;
  private writeStream: fs.WriteStream | null = null;
  private readonly enabled: boolean;

  constructor() {
    // HTTP logging is enabled by default
    // Can be disabled by setting HTTP_LOG_ENABLED=false
    const disabled = process.env.HTTP_LOG_ENABLED === 'false';

    if (disabled) {
      this.enabled = false;
      this.httpLogPath = '';
      this.logger.log('HTTP request logging DISABLED (HTTP_LOG_ENABLED=false)');
      return;
    }

    this.enabled = true;

    // Use HTTP_LOG_PATH if provided, otherwise default to logs/server/server.http.log
    const customPath = process.env.HTTP_LOG_PATH;
    if (customPath && customPath.trim() !== '') {
      this.httpLogPath = path.isAbsolute(customPath)
        ? customPath
        : path.join(process.cwd(), customPath);
    } else {
      // Default path: logs/server/server.http.log
      const logDir = path.join(resolveLogDir(), 'server');
      this.httpLogPath = path.join(logDir, 'server.http.log');
    }

    // Ensure log directory exists
    const logDir = path.dirname(this.httpLogPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Create write stream for HTTP logs (append mode)
    this.writeStream = fs.createWriteStream(this.httpLogPath, { flags: 'a' });

    this.logger.log(`HTTP request logging ENABLED: ${this.httpLogPath}`);
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const startTime = Date.now();
    const { method, originalUrl, ip, headers } = request;

    // Generate or get request ID
    const requestId =
      (headers['x-request-id'] as string) || this.generateRequestId();

    // Get user agent
    const userAgent = headers['user-agent'] || '-';

    // Get real IP (considering proxies)
    const realIp =
      (headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      (headers['x-real-ip'] as string) ||
      ip ||
      '-';

    return next.handle().pipe(
      tap({
        next: () => {
          this.logRequest(
            realIp,
            method,
            originalUrl,
            response.statusCode,
            startTime,
            userAgent,
            requestId
          );
        },
        error: (error: any) => {
          // Log even on error (status will be error status code)
          const statusCode = error?.status || error?.statusCode || 500;
          this.logRequest(
            realIp,
            method,
            originalUrl,
            statusCode,
            startTime,
            userAgent,
            requestId,
            error?.message
          );
        },
      })
    );
  }

  private logRequest(
    ip: string,
    method: string,
    path: string,
    statusCode: number,
    startTime: number,
    userAgent: string,
    requestId: string,
    errorMessage?: string
  ): void {
    // Skip if logging is disabled
    if (!this.enabled || !this.writeStream) {
      return;
    }

    const duration = Date.now() - startTime;
    const timestamp = new Date().toISOString();

    // Apache Combined Log Format + timing + request ID
    // Format: TIMESTAMP IP METHOD PATH STATUS DURATION "USER-AGENT" [REQUEST_ID] ERROR?
    let logLine = `${timestamp} ${ip} ${method} ${path} ${statusCode} ${duration}ms "${userAgent}" [${requestId}]`;

    if (errorMessage) {
      logLine += ` ERROR: ${errorMessage}`;
    }

    logLine += '\n';

    // Write to HTTP log file
    this.writeStream.write(logLine);

    // Also log to console in development for visibility
    if (process.env.NODE_ENV === 'development') {
      const statusColor =
        statusCode >= 500
          ? '\x1b[31m' // Red for 5xx
          : statusCode >= 400
          ? '\x1b[33m' // Yellow for 4xx
          : statusCode >= 300
          ? '\x1b[36m' // Cyan for 3xx
          : '\x1b[32m'; // Green for 2xx
      const resetColor = '\x1b[0m';

      console.log(
        `${statusColor}${method} ${path} ${statusCode}${resetColor} ${duration}ms`
      );
    }
  }

  private generateRequestId(): string {
    // Simple request ID: timestamp + random string
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `req-${timestamp}-${random}`;
  }

  onModuleDestroy() {
    // Close write stream when module is destroyed
    if (this.writeStream) {
      this.writeStream.end();
    }
  }
}

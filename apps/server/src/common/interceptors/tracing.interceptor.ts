/**
 * OpenTelemetry Tracing Interceptor
 *
 * Creates parent spans for all HTTP requests, ensuring that downstream
 * operations (database queries, external calls, etc.) are properly nested
 * as children of the HTTP request span.
 *
 * This interceptor solves the context propagation issue where database spans
 * appear as orphaned ROOT spans instead of children of HTTP requests.
 *
 * The interceptor:
 * 1. Creates a span for each HTTP request with method and route info
 * 2. Sets attributes like http.method, http.route, http.status_code
 * 3. Propagates the span context to all downstream operations
 * 4. Properly ends the span and sets status on completion/error
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Request, Response } from 'express';
import { trace, context, SpanKind, SpanStatusCode } from '@opentelemetry/api';

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  private readonly tracer = trace.getTracer('nestjs-http', '1.0.0');
  private readonly enabled: boolean;

  constructor() {
    this.enabled = process.env.OTEL_ENABLED === 'true';
    console.log(
      `[TracingInterceptor] Initialized, OTEL_ENABLED=${this.enabled}`
    );
  }

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<any> {
    // Skip if OTEL is disabled
    if (!this.enabled) {
      return next.handle();
    }

    const request = ctx.switchToHttp().getRequest<Request>();
    const response = ctx.switchToHttp().getResponse<Response>();

    // Skip health checks and metrics endpoints
    const url = request.url || '';
    console.log(
      `[TracingInterceptor] intercept called for: ${request.method} ${url}`
    );
    if (
      url.includes('/health') ||
      url.includes('/ready') ||
      url.includes('/metrics')
    ) {
      return next.handle();
    }

    const { method, originalUrl, headers } = request;

    // Get controller and handler names for a meaningful span name
    const controllerName = ctx.getClass()?.name || 'UnknownController';
    const handlerName = ctx.getHandler()?.name || 'unknownHandler';
    const spanName = `${controllerName}.${handlerName}`;

    // Start a new span for this HTTP request
    const span = this.tracer.startSpan(spanName, {
      kind: SpanKind.SERVER,
      attributes: {
        'http.method': method,
        'http.url': originalUrl,
        'http.route': this.getRoute(request),
        'http.user_agent': headers['user-agent'] || '',
        'http.request_id': headers['x-request-id'] || '',
        'nestjs.controller': controllerName,
        'nestjs.handler': handlerName,
        // Add org/project context if present
        ...(headers['x-org-id'] && {
          'emergent.org_id': headers['x-org-id'],
        }),
        ...(headers['x-project-id'] && {
          'emergent.project_id': headers['x-project-id'],
        }),
      },
    });

    // Debug logging
    if (process.env.OTEL_CONSOLE_DEBUG === 'true') {
      const spanContext = span.spanContext();
      console.log(`[TracingInterceptor] Created span for ${spanName}:`);
      console.log(`  traceId: ${spanContext.traceId}`);
      console.log(`  spanId: ${spanContext.spanId}`);
    }

    // Execute the handler within the span context
    // This is the KEY part - context.with() propagates the span to all child operations
    return context.with(trace.setSpan(context.active(), span), () => {
      return next.handle().pipe(
        tap({
          next: () => {
            // Set success status and HTTP status code
            span.setAttribute('http.status_code', response.statusCode);
            span.setStatus({ code: SpanStatusCode.OK });
          },
        }),
        catchError((error: any) => {
          // Set error status
          const statusCode = error?.status || error?.statusCode || 500;
          span.setAttribute('http.status_code', statusCode);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error?.message || 'Unknown error',
          });
          span.recordException(error);
          return throwError(() => error);
        }),
        // Always end the span when the observable completes or errors
        tap({
          finalize: () => {
            span.end();
            if (process.env.OTEL_CONSOLE_DEBUG === 'true') {
              console.log(`[TracingInterceptor] Ended span for ${spanName}`);
            }
          },
        })
      );
    });
  }

  /**
   * Extract the route pattern from the request
   * e.g., /api/projects/:id instead of /api/projects/123
   */
  private getRoute(request: Request): string {
    // Express stores the route pattern in request.route
    const route = (request as any).route;
    if (route?.path) {
      return route.path;
    }
    // Fall back to the base path
    return request.baseUrl + (request.path || '');
  }
}

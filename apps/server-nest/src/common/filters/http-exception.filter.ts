import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

interface ErrorEnvelope {
    error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
    };
}

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
    catch(exception: unknown, host: ArgumentsHost) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request: any = ctx.getRequest?.();

        if (response.headersSent) return;

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let code = 'internal';
        let message = 'Internal server error';
        let details: Record<string, unknown> | undefined;

        let isHttp = false;
        if (exception instanceof HttpException) {
            isHttp = true;
            status = exception.getStatus();
            const res = exception.getResponse();
            if (typeof res === 'string') {
                message = res;
            } else if (typeof res === 'object' && res) {
                const anyRes = res as any;
                // Support both top-level { message, code, details } and nested { error: { code, message, details } }
                if (anyRes.error && typeof anyRes.error === 'object') {
                    const nested = anyRes.error;
                    if (nested.message) message = nested.message;
                    if (nested.details || nested.errors) details = nested.details || nested.errors;
                    if (nested.code && typeof nested.code === 'string') code = nested.code;
                }
                if (anyRes.message) message = anyRes.message;
                if (!details && (anyRes.details || anyRes.errors)) details = anyRes.details || anyRes.errors;
                if (anyRes.code && typeof anyRes.code === 'string') code = anyRes.code;
            }
            switch (status) {
                case 400:
                    // Preserve custom code if provided; otherwise infer
                    if (code === 'internal' || code === 'bad-request') {
                        if (details) {
                            code = 'validation-failed';
                        } else if (code === 'internal') {
                            code = 'bad-request';
                        }
                    }
                    break;
                case 401: code = 'unauthorized'; break;
                case 403: code = 'forbidden'; break;
                case 404: code = 'not-found'; break;
                case 409: code = 'conflict'; break;
                case 422: code = 'validation-failed'; break;
                case 429: code = 'rate-limited'; break;
                case 503: code = 'upstream-unavailable'; break;
                default: code = status >= 500 ? 'internal' : code;
            }
        } else {
            // Non-HttpExceptions bubble as 500; log for diagnostics in tests only
            if (process.env.NODE_ENV === 'test') {
                // eslint-disable-next-line no-console
                console.error('Unhandled exception object:', exception);
            }
        }

        const envelope: ErrorEnvelope = { error: { code, message, ...(details ? { details } : {}) } };

        // Append 5xx errors to a log file for later inspection (dev + production); skip known HttpExceptions below 500
        try {
            if (status >= 500) {
                const logDir = process.env.ERROR_LOG_DIR || join(process.cwd(), 'logs');
                if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
                const file = join(logDir, 'errors.log');
                let stack: string | undefined;
                if (exception && exception instanceof Error) {
                    stack = exception.stack || undefined;
                } else if (typeof (exception as any)?.stack === 'string') {
                    stack = String((exception as any).stack);
                }
                if (stack) {
                    // Optionally suppress full stack in production unless explicitly enabled
                    const includeFull = process.env.ERROR_LOG_INCLUDE_STACK === '1' || process.env.NODE_ENV !== 'production';
                    // Truncate very large stacks
                    const maxLen = includeFull ? 12000 : 4000;
                    if (stack.length > maxLen) stack = stack.slice(0, maxLen) + '…';
                }
                const line = JSON.stringify({
                    time: new Date().toISOString(),
                    status,
                    code,
                    message,
                    path: request?.url,
                    method: request?.method,
                    details,
                    httpException: isHttp,
                    stack,
                }) + '\n';
                appendFileSync(file, line, { encoding: 'utf-8' });
            }
        } catch {
            // swallow file I/O errors
        }

        response.status(status).json(envelope);
    }
}

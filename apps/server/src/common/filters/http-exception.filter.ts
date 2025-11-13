import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveLogDir } from '../logger/log-path.util';

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
                    if (nested.message && !anyRes.message) message = nested.message;
                    if (nested.details || nested.errors) details = nested.details || nested.errors;
                    if (nested.code && typeof nested.code === 'string') code = nested.code;
                }
                if (anyRes.message) message = typeof anyRes.message === 'string' ? anyRes.message : message;
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
                case 403:
                    // Preserve more specific codes like missing_scope if already set.
                    if (code === 'internal' || code === 'forbidden') code = 'forbidden';
                    break;
                case 404: code = 'not-found'; break;
                case 409: code = 'conflict'; break;
                case 422: code = 'validation-failed'; break;
                case 429: code = 'rate-limited'; break;
                case 503: code = 'upstream-unavailable'; break;
                default: code = status >= 500 ? 'internal' : code;
            }
        } else {
            // Non-Http exceptions: these should be rare, so always log them for visibility
            // Deterministic domain errors should be thrown as HttpExceptions earlier
            // eslint-disable-next-line no-console
            console.error('\n[ERROR] Unhandled non-HTTP exception:', exception);
            // eslint-disable-next-line no-console
            console.error('  This error should ideally be caught and converted to an HttpException\n');
        }

        const envelope: ErrorEnvelope = { error: { code, message, ...(details ? { details } : {}) } };

        // Log 5xx errors to console AND file for better debugging
        if (status >= 500) {
            // Gather error details
            let stack: string | undefined;
            if (exception && exception instanceof Error) {
                stack = exception.stack || undefined;
            } else if (typeof (exception as any)?.stack === 'string') {
                stack = String((exception as any).stack);
            }

            const errorDetails = {
                time: new Date().toISOString(),
                status,
                code,
                message,
                path: request?.url,
                method: request?.method,
                requestId: request?.headers?.['x-request-id'] || request?.id,
                userId: request?.user?.sub,
                orgId: request?.headers?.['x-org-id'],
                projectId: request?.headers?.['x-project-id'],
                details,
                httpException: isHttp,
                stack,
            };

            // Log to console (stderr) for immediate visibility
            // eslint-disable-next-line no-console
            console.error('\n[ERROR 500] Internal Server Error:');
            // eslint-disable-next-line no-console
            console.error(`  Time:      ${errorDetails.time}`);
            // eslint-disable-next-line no-console
            console.error(`  Method:    ${errorDetails.method}`);
            // eslint-disable-next-line no-console
            console.error(`  Path:      ${errorDetails.path}`);
            if (errorDetails.userId) {
                // eslint-disable-next-line no-console
                console.error(`  User ID:   ${errorDetails.userId}`);
            }
            if (errorDetails.orgId) {
                // eslint-disable-next-line no-console
                console.error(`  Org ID:    ${errorDetails.orgId}`);
            }
            if (errorDetails.projectId) {
                // eslint-disable-next-line no-console
                console.error(`  Project:   ${errorDetails.projectId}`);
            }
            // eslint-disable-next-line no-console
            console.error(`  Code:      ${errorDetails.code}`);
            // eslint-disable-next-line no-console
            console.error(`  Message:   ${errorDetails.message}`);
            if (errorDetails.details) {
                // eslint-disable-next-line no-console
                console.error(`  Details:   ${JSON.stringify(errorDetails.details, null, 2)}`);
            }
            if (stack) {
                // eslint-disable-next-line no-console
                console.error('\n  Stack trace:');
                // eslint-disable-next-line no-console
                console.error(stack.split('\n').map(line => `    ${line}`).join('\n'));
            }
            // eslint-disable-next-line no-console
            console.error('---\n');

            // Append to log file for later inspection
            try {
                const logDir = resolveLogDir('ERROR_LOG_DIR');
                if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
                const file = join(logDir, 'errors.log');

                // Optionally suppress full stack in production unless explicitly enabled
                const includeFull = process.env.ERROR_LOG_INCLUDE_STACK === '1' || process.env.NODE_ENV !== 'production';
                // Truncate very large stacks for file logging
                let fileStack = stack;
                if (fileStack) {
                    const maxLen = includeFull ? 12000 : 4000;
                    if (fileStack.length > maxLen) fileStack = fileStack.slice(0, maxLen) + '…';
                }

                const line = JSON.stringify({
                    ...errorDetails,
                    stack: fileStack,
                }) + '\n';
                appendFileSync(file, line, { encoding: 'utf-8' });
            } catch {
                // swallow file I/O errors
            }
        }

        response.status(status).json(envelope);
    }
}

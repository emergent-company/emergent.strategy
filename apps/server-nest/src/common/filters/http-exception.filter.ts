import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

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

        if (response.headersSent) return;

        let status = HttpStatus.INTERNAL_SERVER_ERROR;
        let code = 'internal';
        let message = 'Internal server error';
        let details: Record<string, unknown> | undefined;

        if (exception instanceof HttpException) {
            status = exception.getStatus();
            const res = exception.getResponse();
            if (typeof res === 'string') {
                message = res;
            } else if (typeof res === 'object' && res) {
                const anyRes = res as any;
                message = anyRes.message || message;
                details = anyRes.details || anyRes.errors || undefined;
            }
            switch (status) {
                case 400:
                    // If validation errors present from class-validator (usually status 400 when using ValidationPipe)
                    if (details) {
                        code = 'validation-failed';
                    } else {
                        code = 'bad-request';
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
        response.status(status).json(envelope);
    }
}

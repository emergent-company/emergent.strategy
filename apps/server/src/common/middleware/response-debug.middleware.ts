import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * Debug middleware to verify response lifecycle events
 *
 * This helps debug why HTTP spans might not be ending:
 * - Logs when response 'finish' fires (body sent to client)
 * - Logs when response 'close' fires (connection closed)
 */
@Injectable()
export class ResponseDebugMiddleware implements NestMiddleware {
  private readonly logger = new Logger('ResponseDebug');

  use(req: Request, res: Response, next: NextFunction) {
    const url = req.url;
    const method = req.method;
    const start = Date.now();

    // Log when we receive the request
    this.logger.debug(`[${method}] ${url} - request received`);

    // Listen for response finish
    res.on('finish', () => {
      const duration = Date.now() - start;
      this.logger.debug(
        `[${method}] ${url} - response FINISH (${res.statusCode}) - ${duration}ms`
      );
    });

    // Listen for response close (this should trigger OTEL span end)
    res.on('close', () => {
      const duration = Date.now() - start;
      this.logger.debug(
        `[${method}] ${url} - response CLOSE (${res.statusCode}) - ${duration}ms`
      );
    });

    next();
  }
}

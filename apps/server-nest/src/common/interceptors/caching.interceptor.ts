import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import crypto from 'node:crypto';

@Injectable()
export class CachingInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const ctx = context.switchToHttp();
        const req = ctx.getRequest<any>();
        const res = ctx.getResponse<any>();
        if (req.method !== 'GET') return next.handle();
        return next.handle().pipe(map((data) => {
            try {
                const json = JSON.stringify(data);
                const etag = 'W/"' + crypto.createHash('sha1').update(json).digest('hex') + '"';
                const ifNoneMatch = req.headers['if-none-match'];
                if (ifNoneMatch && ifNoneMatch === etag) {
                    res.status(304);
                    return undefined;
                }
                if (!res.getHeader('ETag')) res.setHeader('ETag', etag);
                if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'private, max-age=30, must-revalidate');
            } catch (_) {
                // ignore serialization issues
            }
            return data;
        }));
    }
}

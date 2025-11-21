import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
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
    return next.handle().pipe(
      map((data) => {
        try {
          const json = JSON.stringify(data);
          const hash = crypto.createHash('sha1').update(json).digest('hex');
          const weakEtag = 'W/"' + hash + '"';
          const strongEtag = '"' + hash + '"';
          const ifNoneMatchRaw = req.headers['if-none-match'];
          if (ifNoneMatchRaw) {
            // Support multi-value If-None-Match, weak/strong normalization per RFC 7232
            const candidates = String(ifNoneMatchRaw)
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            const norm = (v: string) => v.replace(/^W\//i, '').trim();
            const weakNorm = norm(weakEtag);
            const strongNorm = norm(strongEtag);
            const matched = candidates.some((c) => {
              const cn = norm(c);
              return cn === weakNorm || cn === strongNorm;
            });
            if (matched) {
              res.status(304);
              if (!res.getHeader('ETag')) res.setHeader('ETag', weakEtag);
              return undefined; // No body for 304
            }
          }
          // Prefer weak etag to account for insignificant representation changes
          if (!res.getHeader('ETag')) res.setHeader('ETag', weakEtag);
          // Reduced cache TTL from 30s to 5s to show extraction status changes faster
          // See: docs/fixes/052-extraction-status-visibility-caching-issue.md
          if (!res.getHeader('Cache-Control'))
            res.setHeader(
              'Cache-Control',
              'private, max-age=5, must-revalidate'
            );
        } catch (_) {
          // ignore serialization issues
        }
        return data;
      })
    );
  }
}

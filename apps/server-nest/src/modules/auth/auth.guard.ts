import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
    // Explicit @Inject to avoid issues if design:paramtypes metadata isn't emitted under the test transpiler
    constructor(@Inject(AuthService) private readonly auth: AuthService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest<any>();
        const headerRaw = req.headers['authorization'];

        // 1. Missing header entirely
        if (!headerRaw) {
            throw new UnauthorizedException({ error: { code: 'missing_token', message: 'Missing Authorization bearer token' } });
        }

        const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
        if (typeof header !== 'string') {
            throw new UnauthorizedException({ error: { code: 'malformed_authorization', message: 'Authorization header must be a string' } });
        }

        // 2. Wrong scheme / malformed value
        if (!/^Bearer\s+.+/i.test(header)) {
            throw new UnauthorizedException({ error: { code: 'malformed_authorization', message: 'Authorization header must be: Bearer <token>' } });
        }

        const token = header.replace(/^Bearer\s+/i, '');
        const user = await this.auth.validateToken(token);
        if (!user) {
            throw new UnauthorizedException({ error: { code: 'invalid_token', message: 'Invalid or expired access token' } });
        }
        req.user = user;
        if (process.env.DEBUG_AUTH_SCOPES === '1') {
            try {
                const res = context.switchToHttp().getResponse();
                res.setHeader('X-Debug-Scopes', (user.scopes || []).join(','));
            } catch { /* ignore */ }
        }
        return true;
    }
}

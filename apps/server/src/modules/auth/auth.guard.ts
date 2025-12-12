import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  // Explicit @Inject to avoid issues if design:paramtypes metadata isn't emitted under the test transpiler
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<any>();
    const headerRaw = req.headers['authorization'];
    const path = req.path;

    console.log('[AuthGuard] Request to:', path);

    // Support token in query param for SSE endpoints (EventSource API cannot set headers)
    const queryToken = req.query?.token as string | undefined;
    if (queryToken && path.includes('/events/stream')) {
      console.log('[AuthGuard] Using token from query param for SSE endpoint');
      const user = await this.auth.validateToken(queryToken);
      if (!user) {
        console.log('[AuthGuard] Query token validation failed');
        throw new UnauthorizedException({
          error: {
            code: 'invalid_token',
            message: 'Invalid or expired access token',
          },
        });
      }
      console.log('[AuthGuard] User validated from query token:', {
        id: user.id,
        email: user.email,
        scopes: user.scopes?.slice(0, 3),
      });
      req.user = user;
      return true;
    }

    // 1. Missing header entirely
    if (!headerRaw) {
      console.log('[AuthGuard] Missing Authorization header');
      throw new UnauthorizedException({
        error: {
          code: 'missing_token',
          message: 'Missing Authorization bearer token',
        },
      });
    }

    const header = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
    if (typeof header !== 'string') {
      console.log(
        '[AuthGuard] Authorization header not a string:',
        typeof header
      );
      throw new UnauthorizedException({
        error: {
          code: 'malformed_authorization',
          message: 'Authorization header must be a string',
        },
      });
    }

    // 2. Wrong scheme / malformed value
    if (!/^Bearer\s+.+/i.test(header)) {
      console.log('[AuthGuard] Invalid Bearer format');
      throw new UnauthorizedException({
        error: {
          code: 'malformed_authorization',
          message: 'Authorization header must be: Bearer <token>',
        },
      });
    }

    const token = header.replace(/^Bearer\s+/i, '');
    console.log(
      '[AuthGuard] Token present, validating... (length:',
      token.length,
      ')'
    );

    const user = await this.auth.validateToken(token);
    if (!user) {
      console.log('[AuthGuard] Token validation failed');
      throw new UnauthorizedException({
        error: {
          code: 'invalid_token',
          message: 'Invalid or expired access token',
        },
      });
    }

    console.log('[AuthGuard] User validated:', {
      id: user.id,
      email: user.email,
      scopes: user.scopes?.slice(0, 3),
    });

    req.user = user;
    if (process.env.DEBUG_AUTH_SCOPES === '1') {
      try {
        const res = context.switchToHttp().getResponse();
        res.setHeader('X-Debug-Scopes', (user.scopes || []).join(','));
      } catch {
        /* ignore */
      }
    }
    return true;
  }
}

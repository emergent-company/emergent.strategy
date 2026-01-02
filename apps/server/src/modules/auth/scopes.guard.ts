import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPES_KEY } from './scopes.decorator';
import { PermissionService } from './permission.service';
import { AuditService } from './audit.service';

interface UserWithScopes {
  scopes?: string[] | undefined;
  [k: string]: any;
  permissions?: { scopes: string[] };
}

@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PermissionService) private readonly perms: PermissionService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || [];

    const req = context.switchToHttp().getRequest<any>();
    const user: UserWithScopes | undefined = req.user;
    if (!user) return false;

    // Use internal UUID for permission lookup, not external Zitadel ID
    // Check if already computed for this request (avoids redundant DB queries)
    let computed = req.effectivePermissions;
    if (!computed) {
      computed = await this.perms.compute(user.id);
      req.effectivePermissions = computed;
    }
    const dynamicScopes = computed.scopes || [];
    user.permissions = { ...(user.permissions || {}), scopes: dynamicScopes };

    if (!required.length) {
      return true;
    }

    const scopesDisabled = process.env.SCOPES_DISABLED === '1';
    if (scopesDisabled) return true;

    const effective = new Set([...(user.scopes || []), ...dynamicScopes]);
    const missing = required.filter((r) => !effective.has(r));
    if (missing.length) {
      // Phase 3: Log authorization denial (6a)
      this.logAuthzDenied(req, user, required, Array.from(effective), missing);

      if (process.env.DEBUG_AUTH_SCOPES === '1') {
        try {
          const res = context.switchToHttp().getResponse();
          res.setHeader('X-Missing-Scopes', missing.join(','));
          res.setHeader('X-Effective-Scopes', Array.from(effective).join(','));
        } catch {
          /* ignore */
        }
      }
      throw new ForbiddenException({
        error: {
          code: 'forbidden',
          message: 'Forbidden',
          details: { missing },
        },
      });
    }

    // Phase 3: Log successful authorization (6a)
    this.logAuthzAllowed(req, user, required, Array.from(effective));

    return true;
  }

  /**
   * Phase 3: Log successful authorization (6a)
   */
  private logAuthzAllowed(
    req: any,
    user: UserWithScopes,
    requiredScopes: string[],
    effectiveScopes: string[]
  ): void {
    try {
      this.audit
        .logAuthzAllowed({
          userId: user.id, // Use internal UUID for audit logs
          userEmail: user.email,
          endpoint: req.route?.path || req.url,
          httpMethod: req.method,
          action: `${req.method} ${req.route?.path || req.url}`,
          requiredScopes,
          effectiveScopes,
          ipAddress: req.ip || req.connection?.remoteAddress,
          userAgent: req.headers['user-agent'],
          requestId: req.headers['x-request-id'] || req.id,
        })
        .catch(() => {
          /* silent failure */
        });
    } catch {
      /* never throw */
    }
  }

  /**
   * Phase 3: Log authorization denial (6a)
   */
  private logAuthzDenied(
    req: any,
    user: UserWithScopes,
    requiredScopes: string[],
    effectiveScopes: string[],
    missingScopes: string[]
  ): void {
    try {
      this.audit
        .logAuthzDenied({
          userId: user.id, // Use internal UUID for audit logs
          userEmail: user.email,
          endpoint: req.route?.path || req.url,
          httpMethod: req.method,
          action: `${req.method} ${req.route?.path || req.url}`,
          requiredScopes,
          effectiveScopes,
          missingScopes,
          ipAddress: req.ip || req.connection?.remoteAddress,
          userAgent: req.headers['user-agent'],
          requestId: req.headers['x-request-id'] || req.id,
          statusCode: 403,
        })
        .catch(() => {
          /* silent failure */
        });
    } catch {
      /* never throw */
    }
  }
}

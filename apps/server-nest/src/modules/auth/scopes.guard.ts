import { CanActivate, ExecutionContext, Injectable, ForbiddenException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPES_KEY } from './scopes.decorator';
import { PermissionService } from './permission.service';
import { AuditService } from './audit.service';

interface UserWithScopes { scopes?: string[] | undefined;[k: string]: any; permissions?: { scopes: string[] } }

@Injectable()
export class ScopesGuard implements CanActivate {
    constructor(
        @Inject(Reflector) private readonly reflector: Reflector,
        @Inject(PermissionService) private readonly perms: PermissionService,
        @Inject(AuditService) private readonly audit: AuditService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const required = this.reflector.getAllAndOverride<string[]>(SCOPES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]) || [];
        if (!required.length) return true;
        const req = context.switchToHttp().getRequest<any>();
        const user: UserWithScopes | undefined = req.user;
        if (!user) return false;
        // Feature flag: bypass enforcement when SCOPES_DISABLED=1 (legacy behavior)
        if (process.env.SCOPES_DISABLED === '1') return true;
        // Compute dynamic scopes from memberships (server-side authoritative)
        if (!user.permissions) {
            const computed = await this.perms.compute(user.sub);
            user.permissions = { scopes: computed.scopes };
        }
        const effective = new Set([...(user.scopes || []), ...(user.permissions?.scopes || [])]);
        const missing = required.filter(r => !effective.has(r));
        if (missing.length) {
            // Phase 3: Log authorization denial (6a)
            this.logAuthzDenied(req, user, required, Array.from(effective), missing);

            if (process.env.DEBUG_AUTH_SCOPES === '1') {
                try {
                    const res = context.switchToHttp().getResponse();
                    res.setHeader('X-Missing-Scopes', missing.join(','));
                    res.setHeader('X-Effective-Scopes', Array.from(effective).join(','));
                } catch { /* ignore */ }
            }
            throw new ForbiddenException({ error: { code: 'forbidden', message: 'Forbidden', details: { missing } } });
        }

        // Phase 3: Log successful authorization (6a)
        this.logAuthzAllowed(req, user, required, Array.from(effective));

        return true;
    }

    /**
     * Phase 3: Log successful authorization (6a)
     */
    private logAuthzAllowed(req: any, user: UserWithScopes, requiredScopes: string[], effectiveScopes: string[]): void {
        try {
            this.audit.logAuthzAllowed({
                userId: user.sub,
                userEmail: user.email,
                endpoint: req.route?.path || req.url,
                httpMethod: req.method,
                action: `${req.method} ${req.route?.path || req.url}`,
                requiredScopes,
                effectiveScopes,
                ipAddress: req.ip || req.connection?.remoteAddress,
                userAgent: req.headers['user-agent'],
                requestId: req.headers['x-request-id'] || req.id,
            }).catch(() => { /* silent failure */ });
        } catch { /* never throw */ }
    }

    /**
     * Phase 3: Log authorization denial (6a)
     */
    private logAuthzDenied(req: any, user: UserWithScopes, requiredScopes: string[], effectiveScopes: string[], missingScopes: string[]): void {
        try {
            this.audit.logAuthzDenied({
                userId: user.sub,
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
            }).catch(() => { /* silent failure */ });
        } catch { /* never throw */ }
    }
}

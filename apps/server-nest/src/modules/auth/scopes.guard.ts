import { CanActivate, ExecutionContext, Injectable, ForbiddenException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPES_KEY } from './scopes.decorator';

@Injectable()
export class ScopesGuard implements CanActivate {
    constructor(@Inject(Reflector) private readonly reflector: Reflector) { }
    canActivate(context: ExecutionContext): boolean {
        const required: string[] | undefined = this.reflector.getAllAndOverride(SCOPES_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!required || required.length === 0) return true;
        const req = context.switchToHttp().getRequest<any>();
        const user = req.user as { scopes?: string[] } | undefined;
        const userScopes = new Set((user?.scopes || []).map(s => s.toLowerCase()));
        const missing = required.filter(r => !userScopes.has(r.toLowerCase()));
        if (missing.length) throw new ForbiddenException('Forbidden');
        return true;
    }
}

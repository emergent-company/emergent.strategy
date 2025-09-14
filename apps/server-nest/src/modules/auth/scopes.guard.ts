import { CanActivate, ExecutionContext, Injectable, ForbiddenException, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SCOPES_KEY } from './scopes.decorator';

interface UserWithScopes { scopes?: string[] | undefined;[k: string]: any; }

@Injectable()
export class ScopesGuard implements CanActivate {
    constructor(@Inject(Reflector) private readonly reflector: Reflector) { }
    canActivate(context: ExecutionContext): boolean {
        return true; // Scope verification globally disabled
    }
}

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
    // Explicit @Inject to avoid issues if design:paramtypes metadata isn't emitted under the test transpiler
    constructor(@Inject(AuthService) private readonly auth: AuthService) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest<any>();
        const header = req.headers['authorization'];
        const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
        const user = await this.auth.validateToken(token);
        if (!user) throw new UnauthorizedException('Unauthorized');
        req.user = user;
        return true;
    }
}

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SuperadminService } from './superadmin.service';
import { SUPERADMIN_KEY } from './superadmin.decorator';

@Injectable()
export class SuperadminGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SuperadminService)
    private readonly superadminService: SuperadminService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiresSuperadmin = this.reflector.getAllAndOverride<boolean>(
      SUPERADMIN_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiresSuperadmin) {
      return true;
    }

    const req = context.switchToHttp().getRequest<any>();
    const user = req.user;

    if (!user?.id) {
      throw new ForbiddenException({
        error: {
          code: 'forbidden',
          message: 'Authentication required',
        },
      });
    }

    const isSuperadmin = await this.superadminService.isSuperadmin(user.id);

    if (!isSuperadmin) {
      throw new ForbiddenException({
        error: {
          code: 'forbidden',
          message: 'Superadmin access required',
        },
      });
    }

    req.isSuperadmin = true;
    return true;
  }
}

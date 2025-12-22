import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProfile } from '../../entities/user-profile.entity';
import { SuperadminService } from '../../modules/superadmin/superadmin.service';

export const VIEW_AS_HEADER = 'x-view-as-user-id';

export interface ViewAsUser {
  id: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  zitadelUserId: string;
}

/**
 * Enables superadmin "view-as" impersonation via `X-View-As-User-ID` header.
 * Sets `req.viewAsUser` (impersonated) and `req.superadminUser` (actual actor).
 * @see openspec/changes/add-superadmin-panel/design.md (D2)
 */
@Injectable()
export class ViewAsMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ViewAsMiddleware.name);

  constructor(
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
    private readonly superadminService: SuperadminService
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const viewAsUserId = req.headers[VIEW_AS_HEADER] as string | undefined;

    if (!viewAsUserId) {
      return next();
    }

    const user = (req as any).user;

    if (!user?.id) {
      this.logger.warn(
        `View-as header present but no authenticated user. Header value: ${viewAsUserId}`
      );
      return next();
    }

    if (!this.isValidUuid(viewAsUserId)) {
      this.logger.warn(
        `Invalid UUID format in view-as header: ${viewAsUserId}`
      );
      return next();
    }

    const isSuperadmin = await this.superadminService.isSuperadmin(user.id);
    if (!isSuperadmin) {
      this.logger.warn(
        `Non-superadmin user ${user.id} attempted view-as for ${viewAsUserId}`
      );
      return next();
    }

    const targetUser = await this.userProfileRepository.findOne({
      where: { id: viewAsUserId },
    });

    if (!targetUser) {
      this.logger.warn(`View-as target user not found: ${viewAsUserId}`);
      return next();
    }

    const viewAsUser: ViewAsUser = {
      id: targetUser.id,
      displayName: targetUser.displayName,
      firstName: targetUser.firstName,
      lastName: targetUser.lastName,
      zitadelUserId: targetUser.zitadelUserId,
    };

    (req as any).superadminUser = user;
    (req as any).viewAsUser = viewAsUser;

    this.logger.debug(
      `Superadmin ${user.id} viewing as user ${viewAsUserId} (${
        targetUser.displayName || targetUser.firstName || 'unnamed'
      })`
    );

    next();
  }

  private isValidUuid(value: string): boolean {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
  }
}

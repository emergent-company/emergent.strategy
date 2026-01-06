import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AuthController } from './auth.controller';
import { ScopesGuard } from './scopes.guard';
import { PermissionService } from './permission.service';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';
import { PostgresCacheService } from './postgres-cache.service';
import { CacheCleanupService } from './cache-cleanup.service';
import { ZitadelService } from './zitadel.service';
import { ZitadelStrategy } from './strategies/zitadel.strategy';
import { UserProfileModule } from '../user-profile/user-profile.module';
import { DatabaseModule } from '../../common/database/database.module';
import { AuditLog } from '../../entities/audit-log.entity';
import { AuthIntrospectionCache } from '../../entities/auth-introspection-cache.entity';
import { OrganizationMembership } from '../../entities/organization-membership.entity';
import { ProjectMembership } from '../../entities/project-membership.entity';
import { ApiToken } from '../../entities/api-token.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AuditLog,
      AuthIntrospectionCache,
      OrganizationMembership,
      ProjectMembership,
      ApiToken,
    ]),
    PassportModule,
    forwardRef(() => UserProfileModule),
    DatabaseModule,
  ],
  providers: [
    AuthService,
    AuthGuard,
    ScopesGuard,
    PermissionService,
    AuditService,
    AuditInterceptor,
    PostgresCacheService,
    CacheCleanupService,
    ZitadelService,
    ZitadelStrategy,
  ],
  controllers: [AuthController],
  exports: [
    AuthService,
    AuthGuard,
    ScopesGuard,
    PermissionService,
    AuditService,
    AuditInterceptor,
    PostgresCacheService,
    ZitadelService,
  ],
})
export class AuthModule {}

import { Module, forwardRef } from '@nestjs/common';
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
import { UserProfileModule } from '../user-profile/user-profile.module';
import { DatabaseModule } from '../../common/database/database.module';

@Module({
    imports: [
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
export class AuthModule { }

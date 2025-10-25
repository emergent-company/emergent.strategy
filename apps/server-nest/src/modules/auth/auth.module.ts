import { Module, forwardRef } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AuthController } from './auth.controller';
import { ScopesGuard } from './scopes.guard';
import { PermissionService } from './permission.service';
import { AuditService } from './audit.service';
import { AuditInterceptor } from './audit.interceptor';
import { UserProfileModule } from '../user-profile/user-profile.module';

@Module({
    imports: [forwardRef(() => UserProfileModule)],
    providers: [AuthService, AuthGuard, ScopesGuard, PermissionService, AuditService, AuditInterceptor],
    controllers: [AuthController],
    exports: [AuthService, AuthGuard, ScopesGuard, PermissionService, AuditService, AuditInterceptor],
})
export class AuthModule { }

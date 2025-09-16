import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AuthController } from './auth.controller';
import { ScopesGuard } from './scopes.guard';
import { PermissionService } from './permission.service';

@Module({
    providers: [AuthService, AuthGuard, ScopesGuard, PermissionService],
    controllers: [AuthController],
    exports: [AuthService, AuthGuard, ScopesGuard, PermissionService],
})
export class AuthModule { }

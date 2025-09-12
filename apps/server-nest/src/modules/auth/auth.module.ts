import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AuthController } from './auth.controller';
import { ScopesGuard } from './scopes.guard';

@Module({
    providers: [AuthService, AuthGuard, ScopesGuard],
    controllers: [AuthController],
    exports: [AuthService, AuthGuard, ScopesGuard],
})
export class AuthModule { }

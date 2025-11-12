import { Module } from '@nestjs/common';
import { AuthPasswordController } from './auth-password.controller';

@Module({ controllers: [AuthPasswordController] })
export class AuthPasswordModule {}

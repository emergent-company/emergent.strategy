import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEmailPreferences } from '../../entities/user-email-preferences.entity';
import { UserEmail } from '../../entities/user-email.entity';
import { UserEmailPreferencesService } from './user-email-preferences.service';
import { UserEmailPreferencesController } from './user-email-preferences.controller';
import { UnsubscribeController } from './unsubscribe.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEmailPreferences, UserEmail]),
    AuthModule, // Required for AuthGuard in UserEmailPreferencesController
  ],
  controllers: [UserEmailPreferencesController, UnsubscribeController],
  providers: [UserEmailPreferencesService],
  exports: [UserEmailPreferencesService],
})
export class UserEmailPreferencesModule {}

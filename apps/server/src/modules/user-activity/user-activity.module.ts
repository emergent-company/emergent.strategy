import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserRecentItem } from '../../entities/user-recent-item.entity';
import { UserActivityService } from './user-activity.service';
import { UserActivityController } from './user-activity.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([UserRecentItem]), AuthModule],
  controllers: [UserActivityController],
  providers: [UserActivityService],
  exports: [UserActivityService],
})
export class UserActivityModule {}

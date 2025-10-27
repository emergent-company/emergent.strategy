import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UserProfileModule } from '../user-profile/user-profile.module';
import { UserDeletionService } from './user-deletion.service';
import { UserDeletionController } from './user-deletion.controller';

@Module({
    imports: [DatabaseModule, AuthModule, UserProfileModule],
    controllers: [UserDeletionController],
    providers: [UserDeletionService],
    exports: [UserDeletionService],
})
export class UserModule {}

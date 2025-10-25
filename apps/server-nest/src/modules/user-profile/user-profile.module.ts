import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UserProfileService } from './user-profile.service';
import { UserProfileController } from './user-profile.controller';
import { DatabaseService } from '../../common/database/database.service';

@Module({
    imports: [forwardRef(() => AuthModule)],
    controllers: [UserProfileController],
    providers: [UserProfileService, DatabaseService],
    exports: [UserProfileService],
})
export class UserProfileModule { }

import { Module } from '@nestjs/common';
import { InvitesService } from './invites.service';
import { InvitesController } from './invites.controller';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../../common/database/database.module';

@Module({
    imports: [AuthModule, DatabaseModule],
    providers: [InvitesService],
    controllers: [InvitesController],
    exports: [InvitesService],
})
export class InvitesModule { }

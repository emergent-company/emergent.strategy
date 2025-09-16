import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrgsController } from './orgs.controller';
import { OrgsService } from './orgs.service';

@Module({ imports: [AuthModule], controllers: [OrgsController], providers: [OrgsService] })
export class OrgsModule { }

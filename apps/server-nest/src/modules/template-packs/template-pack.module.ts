import { Module } from '@nestjs/common';
import { TemplatePackController } from './template-pack.controller';
import { TemplatePackService } from './template-pack.service';
import { DatabaseModule } from '../../common/database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [DatabaseModule, AuthModule],
    controllers: [TemplatePackController],
    providers: [TemplatePackService],
    exports: [TemplatePackService],
})
export class TemplatePackModule { }

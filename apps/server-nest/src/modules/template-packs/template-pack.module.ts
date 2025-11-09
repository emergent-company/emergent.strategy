import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplatePackController } from './template-pack.controller';
import { TemplatePackService } from './template-pack.service';
import { DatabaseModule } from '../../common/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { GraphTemplatePack, ProjectTemplatePack } from './entities';

@Module({
    imports: [
        TypeOrmModule.forFeature([GraphTemplatePack, ProjectTemplatePack]),
        DatabaseModule,
        AuthModule,
    ],
    controllers: [TemplatePackController],
    providers: [TemplatePackService],
    exports: [TemplatePackService],
})
export class TemplatePackModule { }

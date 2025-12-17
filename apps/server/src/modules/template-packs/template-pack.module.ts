import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplatePackController } from './template-pack.controller';
import { TemplatePackStudioController } from './template-pack-studio.controller';
import { TemplatePackService } from './template-pack.service';
import { TemplatePackStudioService } from './template-pack-studio.service';
import { DatabaseModule } from '../../common/database/database.module';
import { AuthModule } from '../auth/auth.module';
import { ChatUiModule } from '../chat-ui/chat-ui.module';
import {
  GraphTemplatePack,
  ProjectTemplatePack,
  TemplatePackStudioSession,
  TemplatePackStudioMessage,
} from './entities';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GraphTemplatePack,
      ProjectTemplatePack,
      TemplatePackStudioSession,
      TemplatePackStudioMessage,
    ]),
    DatabaseModule,
    AuthModule,
    ChatUiModule,
  ],
  controllers: [TemplatePackController, TemplatePackStudioController],
  providers: [TemplatePackService, TemplatePackStudioService],
  exports: [TemplatePackService, TemplatePackStudioService],
})
export class TemplatePackModule {}

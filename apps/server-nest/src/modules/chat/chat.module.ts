import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGenerationService } from './chat-generation.service';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { DatabaseModule } from '../../common/database/database.module';
import { AppConfigModule } from '../../common/config/config.module';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [EmbeddingsModule, DatabaseModule, AppConfigModule, AuthModule],
    controllers: [ChatController],
    providers: [ChatService, ChatGenerationService],
    exports: [ChatService, ChatGenerationService],
})
export class ChatModule { }

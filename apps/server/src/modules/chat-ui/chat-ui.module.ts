import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatUiController } from './chat-ui.controller';
import { LangGraphService } from './services/langgraph.service';
import { ConversationService } from './services/conversation.service';
import { AppConfigModule } from '../../common/config/config.module';
import { DatabaseModule } from '../../common/database/database.module';
import { ChatConversation } from '../../entities/chat-conversation.entity';
import { ChatMessage } from '../../entities/chat-message.entity';

@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    TypeOrmModule.forFeature([ChatConversation, ChatMessage]),
  ],
  controllers: [ChatUiController],
  providers: [LangGraphService, ConversationService],
  exports: [LangGraphService, ConversationService],
})
export class ChatUiModule {}

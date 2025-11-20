import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatSdkController } from './chat-sdk.controller';
import { ChatSdkService } from './chat-sdk.service';
import { AppConfigModule } from '../../common/config/config.module';
import { ChatConversation } from '../../entities/chat-conversation.entity';
import { ChatMessage } from '../../entities/chat-message.entity';
import { ChatUiModule } from '../chat-ui/chat-ui.module';

@Module({
  imports: [
    AppConfigModule,
    TypeOrmModule.forFeature([ChatConversation, ChatMessage]),
    ChatUiModule, // Import to access LangGraphService and ConversationService
  ],
  controllers: [ChatSdkController],
  providers: [ChatSdkService],
  exports: [ChatSdkService],
})
export class ChatSdkModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatSdkController } from './chat-sdk.controller';
import { ChatSdkService } from './chat-sdk.service';
import { AppConfigModule } from '../../common/config/config.module';
import { ChatConversation } from '../../entities/chat-conversation.entity';
import { ChatMessage } from '../../entities/chat-message.entity';
import { ChatUiModule } from '../chat-ui/chat-ui.module';
import { UnifiedSearchModule } from '../unified-search/unified-search.module';
import { TypeRegistryModule } from '../type-registry/type-registry.module';
import { GraphModule } from '../graph/graph.module';
import { ExternalSourcesModule } from '../external-sources/external-sources.module';

@Module({
  imports: [
    AppConfigModule,
    TypeOrmModule.forFeature([ChatConversation, ChatMessage]),
    ChatUiModule, // Import to access LangGraphService and ConversationService
    UnifiedSearchModule, // Import to access UnifiedSearchService for RAG
    TypeRegistryModule,
    GraphModule,
    ExternalSourcesModule, // Import to access ExternalSourcesService for document imports
  ],
  controllers: [ChatSdkController],
  providers: [ChatSdkService],
  exports: [ChatSdkService],
})
export class ChatSdkModule {}

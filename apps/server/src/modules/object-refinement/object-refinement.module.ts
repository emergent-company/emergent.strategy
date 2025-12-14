import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ObjectRefinementController } from './object-refinement.controller';
import { ObjectRefinementService } from './object-refinement.service';
import { ObjectChunksService } from './object-chunks.service';
import { RefinementContextAssembler } from './refinement-context-assembler.service';
import { RefinementPromptBuilder } from './refinement-prompt-builder.service';
import { DatabaseModule } from '../../common/database/database.module';
import { GraphModule } from '../graph/graph.module';
import { ChatModule } from '../chat/chat.module';
import { LangfuseModule } from '../langfuse/langfuse.module';
import { AuthModule } from '../auth/auth.module';
import { ChatUiModule } from '../chat-ui/chat-ui.module';
import { UnifiedSearchModule } from '../unified-search/unified-search.module';
import { TypeRegistryModule } from '../type-registry/type-registry.module';
import { ChatConversation } from '../../entities/chat-conversation.entity';
import { ChatMessage } from '../../entities/chat-message.entity';
import { GraphObject } from '../../entities/graph-object.entity';
import { ObjectChunk } from '../../entities/object-chunk.entity';

/**
 * Module for object refinement chat functionality
 *
 * Provides services for:
 * - Managing object-scoped refinement conversations
 * - Assembling rich context for LLM refinement suggestions
 * - Building prompts for refinement chat
 * - Tracking object-to-chunk provenance
 * - AI-powered tools for knowledge base search, web search, and schema inspection
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatConversation,
      ChatMessage,
      GraphObject,
      ObjectChunk,
    ]),
    DatabaseModule,
    LangfuseModule,
    AuthModule, // Required for AuthGuard in controller
    ChatUiModule, // For LangGraphService (tool-enabled chat)
    UnifiedSearchModule, // For search tool
    TypeRegistryModule, // For schema tool
    forwardRef(() => GraphModule),
    forwardRef(() => ChatModule),
  ],
  controllers: [ObjectRefinementController],
  providers: [
    ObjectRefinementService,
    ObjectChunksService,
    RefinementContextAssembler,
    RefinementPromptBuilder,
  ],
  exports: [
    ObjectRefinementService,
    ObjectChunksService,
    RefinementContextAssembler,
    RefinementPromptBuilder,
  ],
})
export class ObjectRefinementModule {}

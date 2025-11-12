import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGenerationService } from './chat-generation.service';
import { McpClientService } from './mcp-client.service';
import { McpToolDetectorService } from './mcp-tool-detector.service';
import { McpToolSelectorService } from './mcp-tool-selector.service';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { DatabaseModule } from '../../common/database/database.module';
import { AppConfigModule } from '../../common/config/config.module';
import { AuthModule } from '../auth/auth.module';
import { GraphModule } from '../graph/graph.module';
import { ProjectsModule } from '../projects/projects.module';
import { ChatConversation } from '../../entities/chat-conversation.entity';
import { ChatMessage } from '../../entities/chat-message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatConversation, ChatMessage]),
    EmbeddingsModule,
    DatabaseModule,
    AppConfigModule,
    AuthModule,
    GraphModule,
    ProjectsModule,
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatGenerationService,
    McpClientService, // MCP Client for consuming MCP servers (Phase 1: our server, Phase 2: external servers)
    McpToolDetectorService, // MCP Tool Detector for keyword-based intent detection (fallback)
    McpToolSelectorService, // MCP Tool Selector using LLM for intelligent tool selection
  ],
  exports: [
    ChatService,
    ChatGenerationService,
    McpClientService,
    McpToolDetectorService,
    McpToolSelectorService,
  ],
})
export class ChatModule {}

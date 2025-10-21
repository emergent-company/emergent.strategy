import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGenerationService } from './chat-generation.service';
import { McpClientService } from './mcp-client.service';
import { McpToolDetectorService } from './mcp-tool-detector.service';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { DatabaseModule } from '../../common/database/database.module';
import { AppConfigModule } from '../../common/config/config.module';
import { AuthModule } from '../auth/auth.module';

@Module({
    imports: [EmbeddingsModule, DatabaseModule, AppConfigModule, AuthModule],
    controllers: [ChatController],
    providers: [
        ChatService,
        ChatGenerationService,
        McpClientService,         // MCP Client for consuming MCP servers (Phase 1: our server, Phase 2: external servers)
        McpToolDetectorService    // MCP Tool Detector for keyword-based intent detection
    ],
    exports: [ChatService, ChatGenerationService, McpClientService, McpToolDetectorService],
})
export class ChatModule { }

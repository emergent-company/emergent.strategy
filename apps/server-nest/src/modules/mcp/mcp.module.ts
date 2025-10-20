import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { SchemaTool } from './tools/schema.tool';
import { SpecificDataTool } from './tools/specific-data.tool';
import { GenericDataTool } from './tools/generic-data.tool';
import { SchemaVersionService } from './services/schema-version.service';
import { TemplatePackModule } from '../template-packs/template-pack.module';
import { GraphModule } from '../graph/graph.module';

/**
 * MCP (Model Context Protocol) Module
 * 
 * Exposes knowledge base data to AI agents via standardized MCP tools.
 * 
 * Features:
 * - Schema exposure (template packs, object types, relationships) ✅ Phase 2
 * - Specific data tools (getPersons, getTasks, etc.) ✅ Phase 3 Part 1
 * - Generic fallback tools (getObjectsByType, etc.) ✅ Phase 3 Part 2
 * - Schema versioning for cache invalidation - Phase 3.5 (TODO)
 * 
 * Architecture:
 * - Hybrid tool approach: specific discoverable tools + generic fallbacks
 * - Version-based caching with TTL and optional WebSocket notifications
 * - HTTP caching headers (ETag, Cache-Control)
 * 
 * See docs/mcp-server-implementation-plan.md for full details.
 */
@Module({
    imports: [
        TemplatePackModule,
        GraphModule,
    ],
    controllers: [McpController],
    providers: [
        SchemaVersionService, // Phase 3.5: Schema versioning
        SchemaTool,           // Phase 2: Schema discovery tools
        SpecificDataTool,     // Phase 3: Type-specific data queries
        GenericDataTool,      // Phase 3: Generic fallback queries
    ],
    exports: [SchemaVersionService],
})
export class McpModule { }

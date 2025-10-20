import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { SchemaTool } from './tools/schema.tool';
import { SpecificDataTool } from './tools/specific-data.tool';
import { GenericDataTool } from './tools/generic-data.tool';
import { SchemaVersionService } from './services/schema-version.service';
import { TemplatePackModule } from '../template-packs/template-pack.module';
import { GraphModule } from '../graph/graph.module';
import { AuthModule } from '../auth/auth.module';

/**
 * MCP (Model Context Protocol) Module
 * 
 * Exposes knowledge base data to AI agents via standardized MCP tools.
 * 
 * Features:
 * - Schema exposure (template packs, object types, relationships) ✅ Phase 2
 * - Specific data tools (getPersons, getTasks, etc.) ✅ Phase 3 Part 1
 * - Generic fallback tools (getObjectsByType, etc.) ✅ Phase 3 Part 2
 * - Schema versioning for cache invalidation ✅ Phase 3.5
 * - Authentication & authorization ✅ Phase 4
 * 
 * Architecture:
 * - Hybrid tool approach: specific discoverable tools + generic fallbacks
 * - Version-based caching with TTL and optional WebSocket notifications
 * - HTTP caching headers (ETag, Cache-Control)
 * - JWT authentication with scope-based authorization
 * 
 * Security:
 * - All endpoints require authentication (JWT bearer token)
 * - Schema endpoints require 'schema:read' scope
 * - Data endpoints will require 'data:read' or 'data:write' scopes
 * 
 * See docs/mcp-server-implementation-plan.md for full details.
 */
@Module({
    imports: [
        TemplatePackModule,
        GraphModule,
        AuthModule,  // Phase 4: Authentication & Authorization
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

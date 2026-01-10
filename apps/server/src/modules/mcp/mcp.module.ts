import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpServerController } from './mcp-server.controller';
import { McpSseController } from './mcp-sse.controller';
import { SchemaTool } from './tools/schema.tool';
import { SpecificDataTool } from './tools/specific-data.tool';
import { GenericDataTool } from './tools/generic-data.tool';
import { SchemaVersionService } from './services/schema-version.service';
import { TemplatePackModule } from '../template-packs/template-pack.module';
import { GraphModule } from '../graph/graph.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../../common/database/database.module';

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
 * - JSON-RPC 2.0 MCP Server ✅ Phase 5
 * - SSE Transport for AI agents ✅ Phase 6 (NEW)
 *
 * Architecture:
 * - **Legacy REST API**: McpController (GET /mcp/schema/version, etc.)
 * - **MCP Server (HTTP)**: McpServerController (POST /mcp/rpc) - JSON-RPC 2.0
 * - **MCP Server (SSE)**: McpSseController (GET /mcp/sse/:projectId) - SSE transport
 * - Hybrid tool approach: specific discoverable tools + generic fallbacks
 * - Version-based caching with TTL and optional WebSocket notifications
 * - HTTP caching headers (ETag, Cache-Control)
 * - JWT authentication with scope-based authorization
 * - API token authentication for programmatic access
 *
 * Transports:
 * - HTTP POST (/mcp/rpc) - Traditional JSON-RPC over HTTP
 * - SSE (/mcp/sse/:projectId) - Server-Sent Events for real-time streaming
 *
 * Security:
 * - All endpoints require authentication (JWT or API token)
 * - Schema endpoints require 'schema:read' scope
 * - Data endpoints require 'data:read' or 'data:write' scopes
 *
 * See docs/mcp-server-implementation-plan.md for full details.
 */
@Module({
  imports: [
    TemplatePackModule,
    GraphModule,
    AuthModule, // Authentication & Authorization
    DatabaseModule, // For data query tools
  ],
  controllers: [
    McpController, // Legacy REST API
    McpServerController, // JSON-RPC 2.0 MCP Server (HTTP)
    McpSseController, // MCP Server with SSE transport
  ],
  providers: [
    SchemaVersionService, // Schema versioning
    SchemaTool, // Schema discovery tools
    SpecificDataTool, // Type-specific data queries
    GenericDataTool, // Generic fallback queries
  ],
  exports: [SchemaVersionService],
})
export class McpModule {}

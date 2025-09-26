import { Controller, Post, Get, Param, Body, Patch, Query, Delete, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiOkResponse } from '@nestjs/swagger';
import { Scopes } from '../auth/scopes.decorator';
import { GraphService } from './graph.service';
import { CreateGraphObjectDto } from './dto/create-graph-object.dto';
import { PatchGraphObjectDto } from './dto/patch-graph-object.dto';
import { CreateGraphRelationshipDto } from './dto/create-graph-relationship.dto';
import { PatchGraphRelationshipDto } from './dto/patch-graph-relationship.dto';
import { TraverseGraphDto } from './dto/traverse-graph.dto';
import { HistoryQueryDto, ObjectHistoryResponseDto, RelationshipHistoryResponseDto } from './dto/history.dto';

@ApiTags('Graph')
@Controller('graph')
export class GraphObjectsController {
    constructor(private readonly service: GraphService) { }

    @Post('objects')
    @Scopes('graph:write')
    @ApiOperation({ summary: 'Create a graph object (initial version)' })
    @ApiResponse({ status: 201, description: 'Created' })
    @ApiResponse({ status: 400, description: 'Validation error' })
    create(@Body() dto: CreateGraphObjectDto) { return this.service.createObject(dto); }

    @Get('objects/search')
    @Scopes('graph:read')
    @ApiOperation({ summary: 'Search graph objects (basic filters)' })
    searchObjects(@Query('type') type?: string, @Query('key') key?: string, @Query('label') label?: string, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
        return this.service.searchObjects({ type, key, label, limit: limit ? parseInt(limit, 10) : 20, cursor });
    }

    @Get('objects/:id')
    @Scopes('graph:read')
    @ApiOperation({ summary: 'Get latest version of a graph object' })
    @ApiResponse({ status: 200 })
    @ApiResponse({ status: 404, description: 'Not found' })
    get(@Param('id') id: string) { return this.service.getObject(id); }

    @Patch('objects/:id')
    @Scopes('graph:write')
    @ApiOperation({ summary: 'Patch (create new version) of a graph object' })
    @ApiResponse({ status: 200, description: 'Version created' })
    @ApiResponse({ status: 400, description: 'No effective change' })
    @ApiResponse({ status: 404, description: 'Not found' })
    patch(@Param('id') id: string, @Body() dto: PatchGraphObjectDto) { return this.service.patchObject(id, dto); }

    @Delete('objects/:id')
    @Scopes('graph:write')
    @ApiOperation({ summary: 'Soft delete (tombstone) an object (creates new version with deleted_at)' })
    deleteObject(@Param('id') id: string) { return this.service.deleteObject(id); }

    @Post('objects/:id/restore')
    @Scopes('graph:write')
    @ApiOperation({ summary: 'Restore a soft-deleted object (creates new version clearing deleted_at)' })
    @ApiResponse({ status: 201, description: 'Restored (new version created)' })
    restoreObject(@Param('id') id: string) { return this.service.restoreObject(id); }

    @Get('objects/:id/history')
    @Scopes('graph:read')
    @ApiOperation({ summary: 'List version history for a graph object' })
    @ApiOkResponse({ type: ObjectHistoryResponseDto })
    @ApiResponse({ status: 404, description: 'Not found' })
    history(@Param('id') id: string, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
        const parsed = limit ? parseInt(limit, 10) : 20;
        return this.service.listHistory(id, parsed, cursor);
    }


    // ---------------- Relationships ----------------
    @Post('relationships')
    @Scopes('graph:write')
    @ApiOperation({ summary: 'Create a relationship (initial version) or new version if properties changed' })
    @ApiResponse({ status: 201 })
    async createRel(@Body() dto: CreateGraphRelationshipDto) {
        // Derive org/project from src object (authoritative) to avoid requiring client-supplied IDs
        const src = await this.service.getObject(dto.src_id);
        const orgId = (src as any).org_id || '00000000-0000-0000-0000-000000000000';
        const projectId = (src as any).project_id || '00000000-0000-0000-0000-000000000000';
        return this.service.createRelationship(dto, orgId, projectId);
    }

    @Get('relationships/:id')
    @Scopes('graph:read')
    @ApiOperation({ summary: 'Get relationship by id' })
    getRel(@Param('id') id: string) { return this.service.getRelationship(id); }

    @Get('relationships/search')
    @Scopes('graph:read')
    @ApiOperation({ summary: 'Search relationships (basic filters)' })
    searchRels(@Query('type') type?: string, @Query('src_id') src_id?: string, @Query('dst_id') dst_id?: string, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
        return this.service.searchRelationships({ type, src_id, dst_id, limit: limit ? parseInt(limit, 10) : 20, cursor });
    }

    @Patch('relationships/:id')
    @Scopes('graph:write')
    @ApiOperation({ summary: 'Patch (create new version) of a relationship (only head version allowed)' })
    patchRel(@Param('id') id: string, @Body() dto: PatchGraphRelationshipDto) { return this.service.patchRelationship(id, dto); }

    @Delete('relationships/:id')
    @Scopes('graph:write')
    @ApiOperation({ summary: 'Soft delete a relationship (tombstone version)' })
    deleteRel(@Param('id') id: string) { return this.service.deleteRelationship(id); }

    @Post('relationships/:id/restore')
    @Scopes('graph:write')
    @ApiOperation({ summary: 'Restore a soft-deleted relationship' })
    @ApiResponse({ status: 201, description: 'Restored (new version created)' })
    restoreRel(@Param('id') id: string) { return this.service.restoreRelationship(id); }

    @Get('relationships/:id/history')
    @Scopes('graph:read')
    @ApiOperation({ summary: 'List version history for a relationship' })
    @ApiOkResponse({ type: RelationshipHistoryResponseDto })
    historyRel(@Param('id') id: string, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
        const parsed = limit ? parseInt(limit, 10) : 20;
        return this.service.listRelationshipHistory(id, parsed, cursor);
    }

    @Get('objects/:id/edges')
    @Scopes('graph:read')
    @ApiOperation({ summary: 'List relationships adjacent to an object' })
    edges(@Param('id') id: string, @Query('direction') direction?: string, @Query('limit') limit?: string) {
        const dir: 'out' | 'in' | 'both' = (direction === 'out' || direction === 'in' || direction === 'both') ? direction : 'both';
        return this.service.listEdges(id, dir, limit ? parseInt(limit, 10) : 50);
    }

    @Post('traverse')
    @Scopes('graph:read')
    @ApiOperation({ summary: 'Traverse the graph from one or more root object ids (bounded BFS)' })
    @HttpCode(200)
    traverse(@Body() dto: TraverseGraphDto) {
        return this.service.traverse(dto);
    }
}


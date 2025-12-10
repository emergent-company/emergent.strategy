import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import { AgentService } from './agents.service';
import { AgentSchedulerService } from './agent-scheduler.service';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';

/**
 * AgentsController
 *
 * Admin API for managing agents and their schedules.
 */
@ApiTags('Agents')
@Controller('admin/agents')
@UseGuards(AuthGuard, ScopesGuard)
@ApiBearerAuth()
export class AgentsController {
  constructor(
    private readonly agentService: AgentService,
    private readonly schedulerService: AgentSchedulerService
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all agents' })
  @ApiOkResponse({ description: 'List of agent configurations' })
  @ApiStandardErrors()
  @Scopes('admin:read')
  async listAgents() {
    const agents = await this.agentService.findAll();
    return {
      success: true,
      data: agents,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get agent by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiOkResponse({ description: 'Agent configuration' })
  @ApiStandardErrors()
  @Scopes('admin:read')
  async getAgent(@Param('id', ParseUUIDPipe) id: string) {
    const agent = await this.agentService.findById(id);
    if (!agent) {
      return {
        success: false,
        error: 'Agent not found',
      };
    }
    return {
      success: true,
      data: agent,
    };
  }

  @Get(':id/runs')
  @ApiOperation({ summary: 'Get recent runs for an agent' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiOkResponse({ description: 'List of agent runs' })
  @ApiStandardErrors()
  @Scopes('admin:read')
  async getAgentRuns(@Param('id', ParseUUIDPipe) id: string) {
    const runs = await this.agentService.getRecentRuns(id, 50);
    return {
      success: true,
      data: runs,
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update agent configuration' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        enabled: { type: 'boolean' },
        cronSchedule: { type: 'string' },
        config: { type: 'object' },
      },
    },
  })
  @ApiOkResponse({ description: 'Updated agent configuration' })
  @ApiStandardErrors()
  @Scopes('admin:write')
  async updateAgent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      name?: string;
      enabled?: boolean;
      cronSchedule?: string;
      config?: Record<string, any>;
    }
  ) {
    const agent = await this.agentService.update(id, body);
    if (!agent) {
      return {
        success: false,
        error: 'Agent not found',
      };
    }

    // Reload the agent schedule
    await this.schedulerService.reloadAgent(id);

    return {
      success: true,
      data: agent,
    };
  }

  @Post(':id/trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger an immediate run of the agent' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiOkResponse({ description: 'Agent triggered successfully' })
  @ApiStandardErrors()
  @Scopes('admin:write')
  async triggerAgent(@Param('id', ParseUUIDPipe) id: string) {
    try {
      await this.schedulerService.triggerAgent(id);
      return {
        success: true,
        message: 'Agent triggered successfully',
      };
    } catch (error) {
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
}

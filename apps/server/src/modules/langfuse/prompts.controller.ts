import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  UseGuards,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { ScopesGuard } from '../auth/scopes.guard';
import { Scopes } from '../auth/scopes.decorator';
import { LangfuseService } from './langfuse.service';

// DTO for updating a prompt
class UpdatePromptDto {
  @IsString()
  @IsNotEmpty()
  prompt!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  labels?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  commitMessage?: string;
}

// Response type for prompt
class PromptResponse {
  name!: string;
  prompt!: string;
  version!: number;
  labels!: string[];
  type!: 'text' | 'chat';
  fromLangfuse!: boolean;
}

/**
 * Controller for managing Langfuse prompts.
 * Provides endpoints to fetch and update prompts used by AI features.
 */
@ApiTags('Prompts')
@Controller('prompts')
@UseGuards(AuthGuard, ScopesGuard)
export class PromptsController {
  private readonly logger = new Logger(PromptsController.name);

  constructor(private readonly langfuseService: LangfuseService) {}

  /**
   * Get a prompt by name.
   * Returns the prompt from Langfuse if available, or indicates it's not found.
   */
  @Get(':name')
  @Scopes('settings:read')
  @ApiOperation({
    summary: 'Get a prompt by name',
    description:
      'Fetches a prompt from Langfuse by name. Returns the production-labeled version by default.',
  })
  @ApiOkResponse({
    description: 'Prompt found',
    type: PromptResponse,
  })
  @ApiNotFoundResponse({ description: 'Prompt not found' })
  async getPrompt(@Param('name') name: string): Promise<PromptResponse> {
    if (!this.langfuseService.isPromptManagementAvailable()) {
      throw new BadRequestException(
        'Langfuse prompt management is not available'
      );
    }

    const prompt = await this.langfuseService.getTextPrompt(name);

    if (!prompt) {
      throw new NotFoundException(`Prompt "${name}" not found in Langfuse`);
    }

    return {
      name: prompt.name,
      prompt: prompt.prompt as string,
      version: prompt.version,
      labels: prompt.labels,
      type: prompt.type,
      fromLangfuse: true,
    };
  }

  /**
   * Update a prompt by name.
   * Creates a new version of the prompt in Langfuse.
   */
  @Put(':name')
  @Scopes('settings:write')
  @ApiOperation({
    summary: 'Update a prompt',
    description:
      'Creates a new version of the prompt in Langfuse with the provided content.',
  })
  @ApiOkResponse({
    description: 'Prompt updated successfully',
  })
  @ApiBadRequestResponse({ description: 'Invalid request' })
  async updatePrompt(
    @Param('name') name: string,
    @Body() dto: UpdatePromptDto
  ): Promise<{ name: string; version: number; labels: string[] }> {
    if (!this.langfuseService.isPromptManagementAvailable()) {
      throw new BadRequestException(
        'Langfuse prompt management is not available'
      );
    }

    const result = await this.langfuseService.createOrUpdateTextPrompt(
      name,
      dto.prompt,
      {
        labels: dto.labels ?? ['production'],
        tags: dto.tags,
        commitMessage: dto.commitMessage,
      }
    );

    if (!result) {
      throw new BadRequestException(`Failed to update prompt "${name}"`);
    }

    this.logger.log(`Updated prompt "${name}" to version ${result.version}`);

    return result;
  }
}

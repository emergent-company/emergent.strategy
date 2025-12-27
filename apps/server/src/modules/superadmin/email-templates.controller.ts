import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  NotFoundException,
  BadRequestException,
  ParseUUIDPipe,
  Req,
  Res,
  Logger,
  Optional,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiProduces,
} from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';
import { v4 as uuidv4 } from 'uuid';
import { isAIMessage } from '@langchain/core/messages';

import { AuthGuard } from '../auth/auth.guard';
import { SuperadminGuard } from './superadmin.guard';
import { Superadmin } from './superadmin.decorator';
import { EmailTemplateService } from '../email/email-template.service';
import { LangGraphService } from '../chat-ui/services/langgraph.service';
import { LangfuseService } from '../langfuse/langfuse.service';

import { EmailTemplate } from '../../entities/email-template.entity';
import { EmailTemplateVersion } from '../../entities/email-template-version.entity';

import {
  EmailTemplateListItemDto,
  ListEmailTemplatesResponseDto,
  EmailTemplateDetailDto,
  UpdateEmailTemplateDto,
  UpdateEmailTemplateResponseDto,
  PreviewEmailTemplateDto,
  PreviewEmailTemplateResponseDto,
  ListEmailTemplateVersionsQueryDto,
  ListEmailTemplateVersionsResponseDto,
  RollbackEmailTemplateDto,
  RollbackEmailTemplateResponseDto,
  ResetEmailTemplateResponseDto,
  PreviewMjmlDto,
  PreviewMjmlResponseDto,
} from './dto/email-templates.dto';
import {
  EmailTemplateRefinementMessageDto,
  EmailTemplateRefinementConversationDto,
  EmailTemplateRefinementChatMessageDto,
  ApplyEmailTemplateSuggestionDto,
  ApplyEmailTemplateSuggestionResultDto,
  EmailTemplateSuggestionDto,
} from './dto/email-template-refinement.dto';

interface TemplateRefinementConversation {
  id: string;
  templateId: string;
  messages: {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    userId?: string;
    suggestions?: EmailTemplateSuggestionDto[];
    createdAt: Date;
  }[];
  createdAt: Date;
}

@ApiTags('superadmin')
@ApiBearerAuth()
@Controller('superadmin/email-templates')
export class EmailTemplatesController {
  private readonly logger = new Logger(EmailTemplatesController.name);
  private readonly templateDir: string;
  private readonly conversations = new Map<
    string,
    TemplateRefinementConversation
  >();

  constructor(
    @InjectRepository(EmailTemplate)
    private readonly emailTemplateRepo: Repository<EmailTemplate>,
    @InjectRepository(EmailTemplateVersion)
    private readonly emailTemplateVersionRepo: Repository<EmailTemplateVersion>,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly dataSource: DataSource,
    private readonly langGraphService: LangGraphService,
    @Optional() private readonly langfuseService?: LangfuseService
  ) {
    this.templateDir = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'templates',
      'email'
    );
  }

  @Get()
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'List email templates',
    description: 'Returns all email templates with their customization status',
  })
  @ApiOkResponse({
    description: 'List of email templates',
    type: ListEmailTemplatesResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async listTemplates(): Promise<ListEmailTemplatesResponseDto> {
    const templates = await this.emailTemplateRepo.find({
      relations: ['updatedBy'],
      order: { name: 'ASC' },
    });

    const templateItems: EmailTemplateListItemDto[] = await Promise.all(
      templates.map(async (template) => {
        let currentVersionNumber: number | null = null;
        if (template.currentVersionId) {
          const version = await this.emailTemplateVersionRepo.findOne({
            where: { id: template.currentVersionId },
          });
          currentVersionNumber = version?.versionNumber ?? null;
        }

        return {
          id: template.id,
          name: template.name,
          description: template.description,
          isCustomized: template.isCustomized,
          currentVersionNumber,
          updatedAt: template.updatedAt,
          updatedBy: template.updatedBy
            ? {
                id: template.updatedBy.id,
                name: template.updatedBy.displayName || template.updatedBy.id,
              }
            : null,
        };
      })
    );

    return { templates: templateItems };
  }

  @Get(':id')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Get email template',
    description:
      'Returns a single email template with full content and metadata',
  })
  @ApiOkResponse({
    description: 'Email template details',
    type: EmailTemplateDetailDto,
  })
  @ApiNotFoundResponse({ description: 'Template not found' })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async getTemplate(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<EmailTemplateDetailDto> {
    const template = await this.emailTemplateRepo.findOne({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException({
        error: {
          code: 'not_found',
          message: 'Email template not found',
        },
      });
    }

    let currentVersion = null;
    if (template.currentVersionId) {
      const version = await this.emailTemplateVersionRepo.findOne({
        where: { id: template.currentVersionId },
        relations: ['createdBy'],
      });
      if (version) {
        currentVersion = {
          id: version.id,
          versionNumber: version.versionNumber,
          createdAt: version.createdAt,
          createdBy: version.createdBy
            ? {
                id: version.createdBy.id,
                name: version.createdBy.displayName || version.createdBy.id,
              }
            : null,
        };
      }
    }

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      subjectTemplate: template.subjectTemplate,
      mjmlContent: template.mjmlContent,
      variables: template.variables,
      sampleData: template.sampleData,
      isCustomized: template.isCustomized,
      currentVersion,
    };
  }

  @Put(':id')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Update email template',
    description:
      'Updates the template content. Creates a new version and marks the template as customized.',
  })
  @ApiOkResponse({
    description: 'Template updated successfully',
    type: UpdateEmailTemplateResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Template not found' })
  @ApiBadRequestResponse({ description: 'Invalid MJML content' })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEmailTemplateDto,
    @Req() req: Request
  ): Promise<UpdateEmailTemplateResponseDto> {
    const currentUser = (req as any).user;

    const template = await this.emailTemplateRepo.findOne({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException({
        error: {
          code: 'not_found',
          message: 'Email template not found',
        },
      });
    }

    const validation = this.emailTemplateService.validateBodyMjml(
      dto.mjmlContent
    );
    if (!validation.valid) {
      throw new BadRequestException({
        error: {
          code: 'invalid_mjml',
          message: 'Invalid MJML content',
          details: validation.errors,
        },
      });
    }

    const latestVersion = await this.emailTemplateVersionRepo.findOne({
      where: { templateId: id },
      order: { versionNumber: 'DESC' },
    });
    const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    const result = await this.dataSource.transaction(async (manager) => {
      const newVersion = manager.create(EmailTemplateVersion, {
        templateId: id,
        versionNumber: nextVersionNumber,
        subjectTemplate: dto.subjectTemplate,
        mjmlContent: dto.mjmlContent,
        variables: template.variables,
        sampleData: dto.sampleData ?? template.sampleData,
        changeSummary: dto.changeSummary ?? null,
        createdById: currentUser?.id ?? null,
      });
      const savedVersion = await manager.save(EmailTemplateVersion, newVersion);

      await manager.update(EmailTemplate, id, {
        subjectTemplate: dto.subjectTemplate,
        mjmlContent: dto.mjmlContent,
        sampleData: dto.sampleData ?? template.sampleData,
        currentVersionId: savedVersion.id,
        isCustomized: true,
        updatedById: currentUser?.id ?? null,
      });

      return savedVersion;
    });

    this.emailTemplateService.clearDbCache(template.name);

    return {
      id: template.id,
      versionNumber: result.versionNumber,
      createdAt: result.createdAt,
    };
  }

  @Post(':id/preview')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Preview email template',
    description:
      'Renders the template with sample data or provided override data',
  })
  @ApiOkResponse({
    description: 'Rendered template preview',
    type: PreviewEmailTemplateResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Template not found' })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async previewTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PreviewEmailTemplateDto
  ): Promise<PreviewEmailTemplateResponseDto> {
    const template = await this.emailTemplateRepo.findOne({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException({
        error: {
          code: 'not_found',
          message: 'Email template not found',
        },
      });
    }

    const context = {
      ...template.sampleData,
      ...(dto.data || {}),
    };

    const result = this.emailTemplateService.renderFromContent(
      template.mjmlContent,
      context,
      'default'
    );

    const subjectCompiled = Handlebars.compile(template.subjectTemplate);
    const subject = subjectCompiled(context);

    return {
      html: result.html,
      text: result.text ?? null,
      subject,
    };
  }

  @Post('preview-mjml')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Preview arbitrary MJML content',
    description:
      'Renders arbitrary MJML content with optional data context. Useful for previewing proposed changes before applying them.',
  })
  @ApiOkResponse({
    description: 'Rendered template preview',
    type: PreviewMjmlResponseDto,
  })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  @ApiBadRequestResponse({ description: 'Invalid MJML content' })
  async previewMjml(
    @Body() dto: PreviewMjmlDto
  ): Promise<PreviewMjmlResponseDto> {
    try {
      const context = dto.data || {};

      const result = this.emailTemplateService.renderFromContent(
        dto.mjmlContent,
        context,
        'default'
      );

      let subject: string | null = null;
      if (dto.subjectTemplate) {
        const subjectCompiled = Handlebars.compile(dto.subjectTemplate);
        subject = subjectCompiled(context);
      }

      return {
        html: result.html,
        text: result.text ?? null,
        subject,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to render MJML';
      throw new BadRequestException({
        error: {
          code: 'mjml_render_error',
          message,
        },
      });
    }
  }

  @Get(':id/versions')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'List template versions',
    description: 'Returns version history for a template with pagination',
  })
  @ApiOkResponse({
    description: 'List of template versions',
    type: ListEmailTemplateVersionsResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Template not found' })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async listVersions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListEmailTemplateVersionsQueryDto
  ): Promise<ListEmailTemplateVersionsResponseDto> {
    const template = await this.emailTemplateRepo.findOne({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException({
        error: {
          code: 'not_found',
          message: 'Email template not found',
        },
      });
    }

    const limit = query.limit ?? 20;
    const page = query.page ?? 1;
    const offset = (page - 1) * limit;

    const [versions, total] = await this.emailTemplateVersionRepo.findAndCount({
      where: { templateId: id },
      relations: ['createdBy'],
      order: { versionNumber: 'DESC' },
      take: limit,
      skip: offset,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      versions: versions.map((v) => ({
        id: v.id,
        versionNumber: v.versionNumber,
        changeSummary: v.changeSummary,
        createdAt: v.createdAt,
        createdBy: v.createdBy
          ? {
              id: v.createdBy.id,
              name: v.createdBy.displayName || v.createdBy.id,
            }
          : null,
      })),
      total,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  @Post(':id/rollback')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Rollback template to version',
    description:
      'Creates a new version by copying content from a previous version',
  })
  @ApiOkResponse({
    description: 'Rollback successful',
    type: RollbackEmailTemplateResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Template or version not found' })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async rollbackToVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RollbackEmailTemplateDto,
    @Req() req: Request
  ): Promise<RollbackEmailTemplateResponseDto> {
    const currentUser = (req as any).user;

    const template = await this.emailTemplateRepo.findOne({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException({
        error: {
          code: 'not_found',
          message: 'Email template not found',
        },
      });
    }

    const targetVersion = await this.emailTemplateVersionRepo.findOne({
      where: { id: dto.versionId, templateId: id },
    });

    if (!targetVersion) {
      throw new NotFoundException({
        error: {
          code: 'version_not_found',
          message: 'Version not found or does not belong to this template',
        },
      });
    }

    const latestVersion = await this.emailTemplateVersionRepo.findOne({
      where: { templateId: id },
      order: { versionNumber: 'DESC' },
    });
    const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    const result = await this.dataSource.transaction(async (manager) => {
      const newVersion = manager.create(EmailTemplateVersion, {
        templateId: id,
        versionNumber: nextVersionNumber,
        subjectTemplate: targetVersion.subjectTemplate,
        mjmlContent: targetVersion.mjmlContent,
        variables: targetVersion.variables,
        sampleData: targetVersion.sampleData,
        changeSummary: `Rollback to version ${targetVersion.versionNumber}`,
        createdById: currentUser?.id ?? null,
      });
      const savedVersion = await manager.save(EmailTemplateVersion, newVersion);

      await manager.update(EmailTemplate, id, {
        subjectTemplate: targetVersion.subjectTemplate,
        mjmlContent: targetVersion.mjmlContent,
        sampleData: targetVersion.sampleData,
        currentVersionId: savedVersion.id,
        isCustomized: true,
        updatedById: currentUser?.id ?? null,
      });

      return savedVersion;
    });

    this.emailTemplateService.clearDbCache(template.name);

    return {
      id: template.id,
      versionNumber: result.versionNumber,
    };
  }

  @Post(':id/reset')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Reset template to default',
    description:
      'Loads the file-based template content and creates a new version, marking template as not customized',
  })
  @ApiOkResponse({
    description: 'Reset successful',
    type: ResetEmailTemplateResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Template not found' })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async resetToDefault(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request
  ): Promise<ResetEmailTemplateResponseDto> {
    const currentUser = (req as any).user;

    const template = await this.emailTemplateRepo.findOne({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException({
        error: {
          code: 'not_found',
          message: 'Email template not found',
        },
      });
    }

    const filePath = path.join(this.templateDir, `${template.name}.mjml.hbs`);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException({
        error: {
          code: 'file_not_found',
          message: `File-based template '${template.name}' not found`,
        },
      });
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const defaultSubject = this.getDefaultSubjectTemplate(template.name);
    const defaultSampleData = this.getDefaultSampleData(template.name);

    const latestVersion = await this.emailTemplateVersionRepo.findOne({
      where: { templateId: id },
      order: { versionNumber: 'DESC' },
    });
    const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    const result = await this.dataSource.transaction(async (manager) => {
      const newVersion = manager.create(EmailTemplateVersion, {
        templateId: id,
        versionNumber: nextVersionNumber,
        subjectTemplate: defaultSubject,
        mjmlContent: fileContent,
        variables: template.variables,
        sampleData: defaultSampleData,
        changeSummary: 'Reset to default file-based template',
        createdById: currentUser?.id ?? null,
      });
      const savedVersion = await manager.save(EmailTemplateVersion, newVersion);

      await manager.update(EmailTemplate, id, {
        subjectTemplate: defaultSubject,
        mjmlContent: fileContent,
        sampleData: defaultSampleData,
        currentVersionId: savedVersion.id,
        isCustomized: false,
        updatedById: currentUser?.id ?? null,
      });

      return savedVersion;
    });

    this.emailTemplateService.clearDbCache(template.name);

    return {
      id: template.id,
      versionNumber: result.versionNumber,
    };
  }

  @Get(':id/refinement-chat')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Get refinement conversation for template',
    description:
      'Returns the existing refinement conversation for the template, or creates a new one if none exists.',
  })
  @ApiOkResponse({
    description: 'Refinement conversation',
    type: EmailTemplateRefinementConversationDto,
  })
  @ApiNotFoundResponse({ description: 'Template not found' })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async getRefinementConversation(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<EmailTemplateRefinementConversationDto> {
    const template = await this.emailTemplateRepo.findOne({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException({
        error: {
          code: 'not_found',
          message: 'Email template not found',
        },
      });
    }

    let conversation = this.conversations.get(id);
    if (!conversation) {
      conversation = {
        id: uuidv4(),
        templateId: id,
        messages: [],
        createdAt: new Date(),
      };
      this.conversations.set(id, conversation);
    }

    return {
      id: conversation.id,
      templateId: conversation.templateId,
      templateName: template.name,
      messages: conversation.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        userId: m.userId,
        suggestions: m.suggestions,
        createdAt: m.createdAt,
      })),
      createdAt: conversation.createdAt,
    };
  }

  @Post(':id/refinement-chat')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: 'Send message to refinement chat',
    description:
      'Sends a user message and streams the AI response with template modification suggestions.',
  })
  @ApiOkResponse({
    description: 'Streaming response with AI suggestions',
  })
  @ApiNotFoundResponse({ description: 'Template not found' })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  async sendRefinementMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmailTemplateRefinementMessageDto,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    const currentUser = (req as any).user;

    const template = await this.emailTemplateRepo.findOne({
      where: { id },
    });

    if (!template) {
      res.status(404).json({
        error: {
          code: 'not_found',
          message: 'Email template not found',
        },
      });
      return;
    }

    let versionForStaleSuggestionDetection: number | null = null;
    if (template.currentVersionId) {
      const currentVersion = await this.emailTemplateVersionRepo.findOne({
        where: { id: template.currentVersionId },
        select: ['versionNumber'],
      });
      versionForStaleSuggestionDetection =
        currentVersion?.versionNumber ?? null;
    }

    let conversation = this.conversations.get(id);
    if (!conversation) {
      conversation = {
        id: uuidv4(),
        templateId: id,
        messages: [],
        createdAt: new Date(),
      };
      this.conversations.set(id, conversation);
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    (res as any).flushHeaders?.();

    const metaEvent = {
      type: 'meta',
      conversationId: conversation.id,
      templateId: id,
      templateName: template.name,
      currentVersionNumber: versionForStaleSuggestionDetection,
    };
    res.write(`data: ${JSON.stringify(metaEvent)}\n\n`);

    const userMessage = {
      id: uuidv4(),
      role: 'user' as const,
      content: dto.content,
      userId: currentUser?.id,
      createdAt: new Date(),
    };
    conversation.messages.push(userMessage);

    const traceId = uuidv4();
    const langfuseTraceId = this.langfuseService?.createJobTrace(
      traceId,
      {
        name: `Template Refinement: ${template.name}`,
        templateId: id,
        templateName: template.name,
        conversationId: conversation.id,
        userId: currentUser?.id,
      },
      undefined,
      'template-refinement-chat'
    );

    let responseContent = '';
    let tokenCount = 0;
    let llmError: string | null = null;

    const generation = langfuseTraceId
      ? this.langfuseService?.createObservation(
          langfuseTraceId,
          'template_refinement_generation',
          { userMessage: dto.content },
          {
            templateId: id,
            templateName: template.name,
            conversationId: conversation.id,
          }
        )
      : null;

    try {
      if (this.langGraphService.isReady()) {
        const mjmlContent = dto.currentMjml ?? template.mjmlContent;
        const subjectContent = dto.currentSubject ?? template.subjectTemplate;

        const systemPrompt = `You are an expert email template designer helping to refine MJML email templates.

Current template: ${template.name}
${template.description ? `Purpose: ${template.description}` : ''}

Current Subject Template:
${subjectContent}

Current MJML body content:
\`\`\`mjml
${mjmlContent}
\`\`\`

IMPORTANT: The content above is the BODY ONLY. It will be automatically wrapped in a layout that provides:
- Global font styles (Helvetica Neue, 14px text, #374151 color)
- Header with "Emergent" branding
- Background color (#f3f4f6)
- Footer with copyright and links
- Button styling (indigo #4F46E5)

When the user asks for changes:
1. Understand what they want to modify
2. Provide the updated MJML body content (NOT a complete document)
3. Explain what you changed and why
4. Ensure MJML components are valid
5. Maintain any Handlebars variables like {{variableName}}

Format suggestions as (use exactly this format for parsing):
[SUGGESTION:mjml_change]
<explanation>Brief description of what was changed</explanation>
<content>
<mj-text>...</mj-text>
<mj-button>...</mj-button>
</content>
[/SUGGESTION]

Or for subject changes:
[SUGGESTION:subject_change]
<explanation>Brief description of what was changed</explanation>
<content>
New subject template here
</content>
[/SUGGESTION]

CRITICAL: For mjml_change suggestions:
- Provide ONLY the body content (mj-text, mj-button, mj-section, etc.)
- Do NOT wrap in <mjml>, <mj-head>, or <mj-body> tags
- The layout wrapper handles the document structure, head styles, header, and footer
- Include ALL body content from the original (modified as requested)
- Use consistent MJML components: mj-text, mj-button, mj-divider, mj-image, etc.

Only provide ONE suggestion per type at a time. Make the suggestion complete and ready to apply.`;

        const langGraphStream = await this.langGraphService.streamConversation({
          message: dto.content,
          threadId: conversation.id,
          tools: [],
          systemMessage: systemPrompt,
        });

        for await (const chunk of langGraphStream) {
          if (chunk.messages && Array.isArray(chunk.messages)) {
            const lastMessage = chunk.messages[chunk.messages.length - 1];

            if (isAIMessage(lastMessage)) {
              const content =
                typeof lastMessage.content === 'string'
                  ? lastMessage.content
                  : '';

              if (content.length > responseContent.length) {
                const newContent = content.slice(responseContent.length);
                const tokens = newContent.split(/(\s+)/);
                for (const token of tokens) {
                  if (token) {
                    tokenCount++;
                    res.write(
                      `data: ${JSON.stringify({ type: 'token', token })}\n\n`
                    );
                  }
                }
                responseContent = content;
              }
            }
          }
        }
      } else {
        responseContent = `Template refinement chat is currently unavailable. The AI service is not ready.`;

        res.write(
          `data: ${JSON.stringify({
            type: 'meta',
            generation_disabled: true,
          })}\n\n`
        );

        const disabledTokens = responseContent.split(/(\s+)/);
        for (const token of disabledTokens) {
          if (token) {
            res.write(`data: ${JSON.stringify({ type: 'token', token })}\n\n`);
          }
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'LLM error';
      llmError = errorMessage;
      this.logger.warn(`LangGraph generation failed: ${errorMessage}`);

      res.write(
        `data: ${JSON.stringify({
          type: 'meta',
          generation_error: errorMessage,
        })}\n\n`
      );

      responseContent = `I was unable to analyze the template at this time due to a service issue. Please try again later.`;

      const fallbackTokens = responseContent.split(/(\s+)/);
      for (const token of fallbackTokens) {
        if (token) {
          res.write(`data: ${JSON.stringify({ type: 'token', token })}\n\n`);
        }
      }
    }

    const suggestions = this.parseSuggestionsFromContent(responseContent);

    if (versionForStaleSuggestionDetection !== null) {
      suggestions.forEach(
        (s) => (s.generatedForVersion = versionForStaleSuggestionDetection)
      );
    }

    if (suggestions.length > 0) {
      res.write(
        `data: ${JSON.stringify({ type: 'suggestions', suggestions })}\n\n`
      );
    }

    const assistantMessage = {
      id: uuidv4(),
      role: 'assistant' as const,
      content: responseContent,
      suggestions,
      createdAt: new Date(),
    };
    conversation.messages.push(assistantMessage);

    if (generation && this.langfuseService) {
      this.langfuseService.updateObservation(
        generation,
        {
          response: responseContent,
          suggestionCount: suggestions.length,
        },
        { completionTokens: tokenCount },
        undefined,
        llmError ? 'error' : 'success',
        llmError || undefined
      );
    }

    if (langfuseTraceId && this.langfuseService) {
      await this.langfuseService.finalizeTrace(
        langfuseTraceId,
        llmError ? 'error' : 'success',
        {
          responseLength: responseContent.length,
          suggestionCount: suggestions.length,
          tokenCount,
        }
      );
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  }

  @Post(':id/refinement-chat/apply')
  @UseGuards(AuthGuard, SuperadminGuard)
  @Superadmin()
  @ApiOperation({
    summary: 'Apply a suggestion from refinement chat',
    description:
      'Applies a specific suggestion to update the template content. Creates a new version.',
  })
  @ApiOkResponse({
    description: 'Result of applying the suggestion',
    type: ApplyEmailTemplateSuggestionResultDto,
  })
  @ApiNotFoundResponse({ description: 'Template not found' })
  @ApiForbiddenResponse({ description: 'Superadmin access required' })
  @ApiBadRequestResponse({ description: 'Invalid suggestion' })
  async applySuggestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyEmailTemplateSuggestionDto,
    @Req() req: Request
  ): Promise<ApplyEmailTemplateSuggestionResultDto> {
    const currentUser = (req as any).user;

    const template = await this.emailTemplateRepo.findOne({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException({
        error: {
          code: 'not_found',
          message: 'Email template not found',
        },
      });
    }

    if (dto.type === 'mjml_change') {
      const validation = this.emailTemplateService.validateBodyMjml(
        dto.newContent
      );
      if (!validation.valid) {
        throw new BadRequestException({
          error: {
            code: 'invalid_mjml',
            message: 'Invalid MJML content in suggestion',
            details: validation.errors,
          },
        });
      }
    }

    const latestVersion = await this.emailTemplateVersionRepo.findOne({
      where: { templateId: id },
      order: { versionNumber: 'DESC' },
    });
    const nextVersionNumber = (latestVersion?.versionNumber ?? 0) + 1;

    const updateData: Partial<EmailTemplate> = {
      isCustomized: true,
      updatedById: currentUser?.id ?? null,
    };

    const versionData: Partial<EmailTemplateVersion> = {
      templateId: id,
      versionNumber: nextVersionNumber,
      variables: template.variables,
      sampleData: template.sampleData,
      changeSummary: dto.changeSummary ?? `Applied AI suggestion: ${dto.type}`,
      createdById: currentUser?.id ?? null,
    };

    if (dto.type === 'mjml_change') {
      updateData.mjmlContent = dto.newContent;
      versionData.mjmlContent = dto.newContent;
      versionData.subjectTemplate = template.subjectTemplate;
    } else if (dto.type === 'subject_change') {
      updateData.subjectTemplate = dto.newContent;
      versionData.subjectTemplate = dto.newContent;
      versionData.mjmlContent = template.mjmlContent;
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const newVersion = manager.create(EmailTemplateVersion, versionData);
      const savedVersion = await manager.save(EmailTemplateVersion, newVersion);

      await manager.update(EmailTemplate, id, {
        ...updateData,
        currentVersionId: savedVersion.id,
      });

      return savedVersion;
    });

    this.emailTemplateService.clearDbCache(template.name);

    const conversation = this.conversations.get(id);
    if (conversation) {
      const targetMessage = conversation.messages.find(
        (msg) => msg.id === dto.messageId
      );
      if (targetMessage?.suggestions) {
        const suggestion = targetMessage.suggestions[dto.suggestionIndex];
        if (suggestion && suggestion.type === dto.type) {
          suggestion.status = 'accepted';
        }
      }
    }

    return {
      success: true,
      versionNumber: result.versionNumber,
    };
  }

  private parseSuggestionsFromContent(
    content: string
  ): EmailTemplateSuggestionDto[] {
    const suggestions: EmailTemplateSuggestionDto[] = [];
    const suggestionRegex =
      /\[SUGGESTION:(mjml_change|subject_change)\]\s*<explanation>([\s\S]*?)<\/explanation>\s*<content>([\s\S]*?)<\/content>\s*\[\/SUGGESTION\]/g;

    const hasSuggestionMarker = content.includes('[SUGGESTION:');
    this.logger.debug(
      `[parseSuggestions] len=${content.length} hasMarker=${hasSuggestionMarker}`
    );
    if (hasSuggestionMarker) {
      const markerIndex = content.indexOf('[SUGGESTION:');
      const snippet = content.slice(markerIndex, markerIndex + 200);
      this.logger.debug(`[parseSuggestions] snippet: ${snippet}...`);
    }

    let match;
    let index = 0;
    while ((match = suggestionRegex.exec(content)) !== null) {
      const type = match[1] as 'mjml_change' | 'subject_change';
      const explanation = match[2].trim();
      const newContent = match[3].trim();

      this.logger.debug(
        `[parseSuggestions] found: idx=${index} type=${type} expLen=${explanation.length} contentLen=${newContent.length}`
      );

      suggestions.push({
        index,
        type,
        explanation,
        newContent,
        status: 'pending',
      });
      index++;
    }

    this.logger.debug(`[parseSuggestions] total=${suggestions.length}`);
    return suggestions;
  }

  private getDefaultSubjectTemplate(templateName: string): string {
    const defaults: Record<string, string> = {
      invitation: "You've been invited to join {{organizationName}}",
      welcome: 'Welcome to {{applicationName}}!',
      'release-notification':
        'New Release: {{releaseTitle}} for {{projectName}}',
    };
    return defaults[templateName] || `${templateName} notification`;
  }

  private getDefaultSampleData(templateName: string): Record<string, any> {
    const defaults: Record<string, Record<string, any>> = {
      invitation: {
        recipientName: 'John Doe',
        inviterName: 'Jane Smith',
        organizationName: 'Acme Corp',
        projectName: 'Project Alpha',
        inviteUrl: 'https://app.example.com/invite/abc123',
        applicationName: 'Emergent',
        expiresAt: '2025-01-15',
      },
      welcome: {
        userName: 'John Doe',
        applicationName: 'Emergent',
        loginUrl: 'https://app.example.com/login',
        supportEmail: 'support@example.com',
      },
      'release-notification': {
        recipientName: 'John Doe',
        releaseTitle: 'v2.0.0 - Major Update',
        projectName: 'Project Alpha',
        releaseNotes: 'This release includes new features and bug fixes.',
        viewUrl: 'https://app.example.com/releases/v2.0.0',
        unsubscribeUrl: 'https://app.example.com/unsubscribe',
      },
    };
    return defaults[templateName] || {};
  }
}

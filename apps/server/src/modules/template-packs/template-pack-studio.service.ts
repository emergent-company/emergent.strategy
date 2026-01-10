import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  GraphTemplatePack,
  TemplatePackStudioSession,
  TemplatePackStudioMessage,
  SchemaSuggestion,
  SuggestionStatus,
} from './entities';
import { v4 as uuidv4 } from 'uuid';

/**
 * DTO for creating a new studio session
 */
export interface CreateStudioSessionDto {
  /** Optional pack ID to clone and edit */
  sourcePackId?: string;
  /** Initial name for new packs */
  name?: string;
  /** Initial description */
  description?: string;
}

/**
 * DTO for applying a schema suggestion
 */
export interface ApplySuggestionDto {
  messageId: string;
  suggestionId: string;
}

/**
 * DTO for saving a template pack
 */
export interface SavePackDto {
  name: string;
  description?: string;
  version: string;
}

/**
 * DTO for updating pack name
 */
export interface UpdatePackNameDto {
  name: string;
}

/**
 * Result of applying a suggestion
 */
export interface ApplySuggestionResult {
  success: boolean;
  error?: string;
  updatedPack?: GraphTemplatePack;
}

/**
 * Studio session state returned to frontend
 */
export interface StudioSessionState {
  id: string;
  status: string;
  pack: GraphTemplatePack;
  messages: TemplatePackStudioMessage[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Service for Template Pack Studio functionality
 *
 * Manages studio sessions, draft template packs, and chat-based
 * schema editing with LLM-generated suggestions.
 */
@Injectable()
export class TemplatePackStudioService {
  private readonly logger = new Logger(TemplatePackStudioService.name);

  constructor(
    @InjectRepository(GraphTemplatePack)
    private readonly templatePackRepository: Repository<GraphTemplatePack>,
    @InjectRepository(TemplatePackStudioSession)
    private readonly sessionRepository: Repository<TemplatePackStudioSession>,
    @InjectRepository(TemplatePackStudioMessage)
    private readonly messageRepository: Repository<TemplatePackStudioMessage>
  ) {}

  /**
   * Create a new studio session
   *
   * If sourcePackId is provided, clones the existing pack as a draft.
   * Otherwise, creates a new empty draft pack.
   */
  async createSession(
    userId: string,
    projectId: string,
    dto: CreateStudioSessionDto
  ): Promise<StudioSessionState> {
    let draftPack: GraphTemplatePack;

    if (dto.sourcePackId) {
      // Clone existing pack
      const sourcePack = await this.templatePackRepository.findOne({
        where: { id: dto.sourcePackId },
      });

      if (!sourcePack) {
        throw new NotFoundException(
          `Source template pack not found: ${dto.sourcePackId}`
        );
      }

      draftPack = this.templatePackRepository.create({
        name: dto.name || `${sourcePack.name} (Draft)`,
        version: this.incrementVersion(sourcePack.version),
        description: dto.description || sourcePack.description,
        author: sourcePack.author,
        license: sourcePack.license,
        source: 'manual',
        object_type_schemas: { ...sourcePack.object_type_schemas },
        relationship_type_schemas: { ...sourcePack.relationship_type_schemas },
        ui_configs: { ...sourcePack.ui_configs },
        extraction_prompts: { ...sourcePack.extraction_prompts },
        sql_views: [...(sourcePack.sql_views || [])],
        parent_version_id: sourcePack.id,
        draft: true,
      });
    } else {
      // Create new empty draft pack
      draftPack = this.templatePackRepository.create({
        name: dto.name || 'New Template Pack',
        version: '1.0.0',
        description: dto.description || '',
        source: 'manual',
        object_type_schemas: {},
        relationship_type_schemas: {},
        ui_configs: {},
        extraction_prompts: {},
        sql_views: [],
        draft: true,
      });
    }

    draftPack = await this.templatePackRepository.save(draftPack);
    this.logger.log(`Created draft pack ${draftPack.id} for user ${userId}`);

    // Create session
    const session = this.sessionRepository.create({
      user_id: userId,
      project_id: projectId,
      pack_id: draftPack.id,
      status: 'active',
    });

    const savedSession = await this.sessionRepository.save(session);
    this.logger.log(
      `Created studio session ${savedSession.id} for pack ${draftPack.id}`
    );

    return {
      id: savedSession.id,
      status: savedSession.status,
      pack: draftPack,
      messages: [],
      createdAt: savedSession.created_at,
      updatedAt: savedSession.updated_at,
    };
  }

  /**
   * Get session state by ID
   */
  async getSession(
    sessionId: string,
    userId: string
  ): Promise<StudioSessionState | null> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: ['pack', 'messages'],
    });

    if (!session) {
      return null;
    }

    // Check authorization
    if (session.user_id !== userId) {
      return null;
    }

    return {
      id: session.id,
      status: session.status,
      pack: session.pack!,
      messages: session.messages || [],
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    };
  }

  /**
   * Get active sessions for a user
   */
  async getUserSessions(
    userId: string,
    projectId: string
  ): Promise<StudioSessionState[]> {
    const sessions = await this.sessionRepository.find({
      where: {
        user_id: userId,
        project_id: projectId,
        status: 'active',
      },
      relations: ['pack'],
      order: { updated_at: 'DESC' },
    });

    return sessions.map((session) => ({
      id: session.id,
      status: session.status,
      pack: session.pack!,
      messages: [],
      createdAt: session.created_at,
      updatedAt: session.updated_at,
    }));
  }

  /**
   * Save a user message
   */
  async saveUserMessage(
    sessionId: string,
    content: string
  ): Promise<TemplatePackStudioMessage> {
    const message = this.messageRepository.create({
      session_id: sessionId,
      role: 'user',
      content,
      suggestions: [],
    });

    const saved = await this.messageRepository.save(message);

    // Update session timestamp
    await this.sessionRepository.update(sessionId, {
      updated_at: new Date(),
    });

    return saved;
  }

  /**
   * Save an assistant message with suggestions
   */
  async saveAssistantMessage(
    sessionId: string,
    content: string,
    suggestions: SchemaSuggestion[] = [],
    metadata: Record<string, any> = {}
  ): Promise<TemplatePackStudioMessage> {
    // Assign IDs to suggestions if not present
    const suggestionsWithIds = suggestions.map((s) => ({
      ...s,
      id: s.id || uuidv4(),
      status: s.status || ('pending' as SuggestionStatus),
    }));

    const message = this.messageRepository.create({
      session_id: sessionId,
      role: 'assistant',
      content,
      suggestions: suggestionsWithIds,
      metadata,
    });

    const saved = await this.messageRepository.save(message);

    // Update session timestamp
    await this.sessionRepository.update(sessionId, {
      updated_at: new Date(),
    });

    return saved;
  }

  /**
   * Get messages for a session
   */
  async getMessages(sessionId: string): Promise<TemplatePackStudioMessage[]> {
    return this.messageRepository.find({
      where: { session_id: sessionId },
      order: { created_at: 'ASC' },
    });
  }

  /**
   * Apply a suggestion to the draft pack
   */
  async applySuggestion(
    sessionId: string,
    messageId: string,
    suggestionId: string,
    userId: string
  ): Promise<ApplySuggestionResult> {
    // Get the session
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: ['pack'],
    });

    if (!session || session.user_id !== userId) {
      return { success: false, error: 'Session not found or unauthorized' };
    }

    if (session.status !== 'active') {
      return { success: false, error: 'Session is not active' };
    }

    if (!session.pack) {
      return { success: false, error: 'Pack not found' };
    }

    // Get the message and suggestion
    const message = await this.messageRepository.findOne({
      where: { id: messageId, session_id: sessionId },
    });

    if (!message) {
      return { success: false, error: 'Message not found' };
    }

    const suggestionIndex = message.suggestions.findIndex(
      (s) => s.id === suggestionId
    );
    if (suggestionIndex === -1) {
      return { success: false, error: 'Suggestion not found' };
    }

    const suggestion = message.suggestions[suggestionIndex];

    if (suggestion.status !== 'pending') {
      return { success: false, error: 'Suggestion already processed' };
    }

    try {
      // Apply the suggestion based on type
      const pack = session.pack;
      await this.applySchemaChange(pack, suggestion);

      // Save updated pack
      const updatedPack = await this.templatePackRepository.save(pack);

      // Update suggestion status
      message.suggestions[suggestionIndex] = {
        ...suggestion,
        status: 'accepted',
      };
      await this.messageRepository.save(message);

      this.logger.log(
        `Applied suggestion ${suggestionId} to pack ${pack.id}: ${suggestion.type}`
      );

      return { success: true, updatedPack };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to apply suggestion: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Reject a suggestion
   */
  async rejectSuggestion(
    sessionId: string,
    messageId: string,
    suggestionId: string,
    userId: string,
    reason?: string
  ): Promise<{ success: boolean; error?: string }> {
    // Get the session
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session || session.user_id !== userId) {
      return { success: false, error: 'Session not found or unauthorized' };
    }

    // Get the message
    const message = await this.messageRepository.findOne({
      where: { id: messageId, session_id: sessionId },
    });

    if (!message) {
      return { success: false, error: 'Message not found' };
    }

    const suggestionIndex = message.suggestions.findIndex(
      (s) => s.id === suggestionId
    );
    if (suggestionIndex === -1) {
      return { success: false, error: 'Suggestion not found' };
    }

    const suggestion = message.suggestions[suggestionIndex];

    if (suggestion.status !== 'pending') {
      return { success: false, error: 'Suggestion already processed' };
    }

    // Update suggestion status
    message.suggestions[suggestionIndex] = {
      ...suggestion,
      status: 'rejected',
    };
    await this.messageRepository.save(message);

    this.logger.log(
      `Rejected suggestion ${suggestionId}: ${reason || 'no reason'}`
    );

    return { success: true };
  }

  /**
   * Save the draft pack as a finalized version
   */
  async savePack(
    sessionId: string,
    userId: string,
    dto: SavePackDto
  ): Promise<GraphTemplatePack> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: ['pack'],
    });

    if (!session || session.user_id !== userId) {
      throw new NotFoundException('Session not found or unauthorized');
    }

    if (session.status !== 'active') {
      throw new BadRequestException('Session is not active');
    }

    if (!session.pack) {
      throw new NotFoundException('Pack not found');
    }

    const pack = session.pack;

    // Validate the pack has at least one object type
    if (Object.keys(pack.object_type_schemas).length === 0) {
      throw new BadRequestException(
        'Template pack must have at least one object type'
      );
    }

    // Update pack with final details
    pack.name = dto.name;
    pack.description = dto.description;
    pack.version = dto.version;
    pack.draft = false;
    pack.published_at = new Date();

    const savedPack = await this.templatePackRepository.save(pack);

    // Mark session as completed
    await this.sessionRepository.update(sessionId, {
      status: 'completed',
      updated_at: new Date(),
    });

    this.logger.log(
      `Saved template pack ${savedPack.id}: ${savedPack.name}@${savedPack.version}`
    );

    return savedPack;
  }

  /**
   * Update the pack name for a session
   */
  async updatePackName(
    sessionId: string,
    userId: string,
    name: string
  ): Promise<{ success: boolean; pack?: GraphTemplatePack; error?: string }> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: ['pack'],
    });

    if (!session || session.user_id !== userId) {
      return { success: false, error: 'Session not found or unauthorized' };
    }

    if (session.status !== 'active') {
      return { success: false, error: 'Session is not active' };
    }

    if (!session.pack) {
      return { success: false, error: 'Pack not found' };
    }

    // Update the pack name
    session.pack.name = name;
    const updatedPack = await this.templatePackRepository.save(session.pack);

    // Update session timestamp
    await this.sessionRepository.update(sessionId, {
      updated_at: new Date(),
    });

    this.logger.log(`Updated pack name to "${name}" for session ${sessionId}`);

    return { success: true, pack: updatedPack };
  }

  /**
   * Discard a studio session and its draft pack
   */
  async discardSession(
    sessionId: string,
    userId: string
  ): Promise<{ success: boolean }> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session || session.user_id !== userId) {
      return { success: false };
    }

    // Delete the draft pack if it exists
    if (session.pack_id) {
      await this.templatePackRepository.delete({
        id: session.pack_id,
        draft: true,
      });
    }

    // Update session status
    await this.sessionRepository.update(sessionId, {
      status: 'discarded',
      pack_id: undefined,
      updated_at: new Date(),
    });

    this.logger.log(`Discarded studio session ${sessionId}`);

    return { success: true };
  }

  /**
   * Get the current draft pack for context assembly
   */
  async getDraftPack(sessionId: string): Promise<GraphTemplatePack | null> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
      relations: ['pack'],
    });

    return session?.pack || null;
  }

  /**
   * Clean up empty draft template packs (drafts with no messages)
   * This removes orphaned drafts created when sessions are started but never used
   */
  async cleanupEmptyDrafts(): Promise<number> {
    // Find draft packs with sessions that have no messages
    const emptyDraftSessions = await this.sessionRepository
      .createQueryBuilder('session')
      .innerJoin('kb.graph_template_packs', 'pack', 'session.pack_id = pack.id')
      .leftJoin(
        'kb.template_pack_studio_messages',
        'msg',
        'msg.session_id = session.id'
      )
      .where('pack.draft = true')
      .groupBy('session.id')
      .addGroupBy('session.pack_id')
      .having('COUNT(msg.id) = 0')
      .select(['session.id', 'session.pack_id'])
      .getRawMany();

    let cleaned = 0;
    for (const row of emptyDraftSessions) {
      const packId = row.session_pack_id;
      const sessionId = row.session_id;

      if (packId) {
        // Delete the empty draft pack
        await this.templatePackRepository.delete({
          id: packId,
          draft: true,
        });
      }

      // Delete the session
      await this.sessionRepository.delete(sessionId);
      cleaned++;
    }

    if (cleaned > 0) {
      this.logger.log(
        `Cleaned up ${cleaned} empty draft template packs and sessions`
      );
    }

    return cleaned;
  }

  /**
   * Delete empty schema drafts for a user
   * Empty drafts are those with zero object types AND zero relationship types
   */
  async deleteEmptySchemaDrafts(
    userId: string,
    projectId: string
  ): Promise<{ deleted: number; sessionIds: string[] }> {
    // Get user's active sessions with their packs
    const sessions = await this.sessionRepository.find({
      where: {
        user_id: userId,
        project_id: projectId,
        status: 'active',
      },
      relations: ['pack'],
    });

    const deletedSessionIds: string[] = [];

    for (const session of sessions) {
      if (!session.pack) continue;

      const objectTypeCount = Object.keys(
        session.pack.object_type_schemas || {}
      ).length;
      const relationshipTypeCount = Object.keys(
        session.pack.relationship_type_schemas || {}
      ).length;

      // Delete if both are empty
      if (objectTypeCount === 0 && relationshipTypeCount === 0) {
        const packId = session.pack.id;

        // Delete messages first (foreign key constraint)
        await this.messageRepository.delete({ session_id: session.id });

        // Delete session
        await this.sessionRepository.delete(session.id);

        // Delete draft pack
        await this.templatePackRepository.delete({
          id: packId,
          draft: true,
        });

        deletedSessionIds.push(session.id);
        this.logger.log(
          `Deleted empty draft session ${session.id} and pack ${packId}`
        );
      }
    }

    return {
      deleted: deletedSessionIds.length,
      sessionIds: deletedSessionIds,
    };
  }

  /**
   * Apply a schema change to a pack
   */
  private async applySchemaChange(
    pack: GraphTemplatePack,
    suggestion: SchemaSuggestion
  ): Promise<void> {
    switch (suggestion.type) {
      case 'add_object_type':
        if (!suggestion.target_type || !suggestion.after) {
          throw new Error('Invalid add_object_type suggestion');
        }
        // Extract ui_config if embedded in the after field
        const objectAfter = suggestion.after as Record<string, unknown>;
        const objectUiConfig = objectAfter.ui_config as
          | Record<string, unknown>
          | undefined;
        // Store schema without ui_config
        const objectSchema = { ...objectAfter };
        delete objectSchema.ui_config;
        pack.object_type_schemas[suggestion.target_type] = objectSchema;
        // Use embedded ui_config or default
        pack.ui_configs[suggestion.target_type] = objectUiConfig || {
          icon: 'file',
          color: '#6B7280',
        };
        break;

      case 'modify_object_type':
        if (!suggestion.target_type || !suggestion.after) {
          throw new Error('Invalid modify_object_type suggestion');
        }
        if (!pack.object_type_schemas[suggestion.target_type]) {
          throw new Error(`Object type not found: ${suggestion.target_type}`);
        }
        pack.object_type_schemas[suggestion.target_type] = suggestion.after;
        break;

      case 'remove_object_type':
        if (!suggestion.target_type) {
          throw new Error('Invalid remove_object_type suggestion');
        }
        delete pack.object_type_schemas[suggestion.target_type];
        delete pack.ui_configs[suggestion.target_type];
        delete pack.extraction_prompts[suggestion.target_type];
        break;

      case 'add_relationship_type':
        if (!suggestion.target_type || !suggestion.after) {
          throw new Error('Invalid add_relationship_type suggestion');
        }
        // Extract ui_config if embedded in the after field
        const relAfter = suggestion.after as Record<string, unknown>;
        const relUiConfig = relAfter.ui_config as
          | Record<string, unknown>
          | undefined;
        // Store schema without ui_config
        const relSchema = { ...relAfter };
        delete relSchema.ui_config;
        pack.relationship_type_schemas[suggestion.target_type] = relSchema;
        // Store ui_config if provided
        if (relUiConfig) {
          pack.ui_configs[suggestion.target_type] = relUiConfig;
        }
        break;

      case 'modify_relationship_type':
        if (!suggestion.target_type || !suggestion.after) {
          throw new Error('Invalid modify_relationship_type suggestion');
        }
        if (!pack.relationship_type_schemas[suggestion.target_type]) {
          throw new Error(
            `Relationship type not found: ${suggestion.target_type}`
          );
        }
        pack.relationship_type_schemas[suggestion.target_type] =
          suggestion.after;
        break;

      case 'remove_relationship_type':
        if (!suggestion.target_type) {
          throw new Error('Invalid remove_relationship_type suggestion');
        }
        delete pack.relationship_type_schemas[suggestion.target_type];
        break;

      case 'update_ui_config':
        if (!suggestion.target_type || !suggestion.after) {
          throw new Error('Invalid update_ui_config suggestion');
        }
        pack.ui_configs[suggestion.target_type] = suggestion.after;
        break;

      case 'update_extraction_prompt':
        if (!suggestion.target_type || !suggestion.after) {
          throw new Error('Invalid update_extraction_prompt suggestion');
        }
        pack.extraction_prompts[suggestion.target_type] = suggestion.after;
        break;

      default:
        throw new Error(`Unknown suggestion type: ${suggestion.type}`);
    }
  }

  /**
   * Increment a semantic version string
   */
  private incrementVersion(version: string): string {
    const parts = version.split('.');
    if (parts.length === 3) {
      const patch = parseInt(parts[2], 10) || 0;
      return `${parts[0]}.${parts[1]}.${patch + 1}`;
    }
    return `${version}.1`;
  }

  /**
   * Parse suggestions from LLM response content
   *
   * Looks for ```suggestions code blocks with JSON arrays
   */
  parseSuggestionsFromContent(content: string): SchemaSuggestion[] {
    const regex = /```suggestions\s*([\s\S]*?)```/g;
    const suggestions: SchemaSuggestion[] = [];

    let match;
    while ((match = regex.exec(content)) !== null) {
      try {
        const jsonContent = match[1].trim();
        const parsed = JSON.parse(jsonContent);
        if (Array.isArray(parsed)) {
          suggestions.push(
            ...parsed.map((s) => ({
              ...s,
              id: s.id || uuidv4(),
              status: 'pending' as SuggestionStatus,
            }))
          );
        }
      } catch (e) {
        this.logger.warn(`Failed to parse suggestions block: ${e}`);
      }
    }

    return suggestions;
  }

  /**
   * Build context for LLM from current pack state
   */
  buildPackContext(pack: GraphTemplatePack): string {
    const context: string[] = [];

    context.push(`# Current Template Pack: ${pack.name}`);
    context.push(`Version: ${pack.version}`);
    if (pack.description) {
      context.push(`Description: ${pack.description}`);
    }
    context.push('');

    // Object types
    const objectTypes = Object.entries(pack.object_type_schemas);
    if (objectTypes.length > 0) {
      context.push('## Object Types');
      for (const [typeName, schema] of objectTypes) {
        context.push(`### ${typeName}`);
        context.push('```json');
        context.push(JSON.stringify(schema, null, 2));
        context.push('```');
        context.push('');
      }
    } else {
      context.push('## Object Types');
      context.push('No object types defined yet.');
      context.push('');
    }

    // Relationship types
    const relationshipTypes = Object.entries(pack.relationship_type_schemas);
    if (relationshipTypes.length > 0) {
      context.push('## Relationship Types');
      for (const [typeName, schema] of relationshipTypes) {
        context.push(`### ${typeName}`);
        context.push('```json');
        context.push(JSON.stringify(schema, null, 2));
        context.push('```');
        context.push('');
      }
    }

    // UI configs
    const uiConfigs = Object.entries(pack.ui_configs);
    if (uiConfigs.length > 0) {
      context.push('## UI Configurations');
      context.push('```json');
      context.push(JSON.stringify(pack.ui_configs, null, 2));
      context.push('```');
      context.push('');
    }

    return context.join('\n');
  }
}

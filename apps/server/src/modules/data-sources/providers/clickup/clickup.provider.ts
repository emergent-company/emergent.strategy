import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DataSourceProvider,
  BrowseOptions,
  BrowseResult,
  ImportItem,
  ImportResult,
  TestConnectionResult,
  ProviderMetadata,
  SyncOptions,
  SyncPreviewResult,
  FolderStats,
} from '../provider.interface';
import { ClickUpApiService } from './clickup-api.service';
import {
  ClickUpConfigDto,
  CLICKUP_CONFIG_SCHEMA,
  ClickUpBrowseItem,
  ClickUpDocumentMetadata,
} from './dto';
import { Document } from '../../../../entities/document.entity';
import { Project } from '../../../../entities/project.entity';
import { DocumentsService } from '../../../documents/documents.service';
import { ClickUpPage } from '../../../clickup/clickup.types';

/**
 * ClickUp Provider
 *
 * Implements the DataSourceProvider interface for ClickUp Docs import.
 * Uses the ClickUp API v3 to browse and import docs and their pages.
 *
 * Key features:
 * - Browse workspace structure (workspaces, spaces, docs)
 * - Import ClickUp Docs with all pages combined into single documents
 * - Incremental sync based on date_updated
 * - Support for space-level filtering
 */
@Injectable()
export class ClickUpProvider implements DataSourceProvider {
  private readonly logger = new Logger(ClickUpProvider.name);

  constructor(
    private readonly clickupApiService: ClickUpApiService,
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @Inject(forwardRef(() => DocumentsService))
    private readonly documentsService: DocumentsService
  ) {}

  /**
   * Get provider metadata
   */
  getMetadata(): ProviderMetadata {
    return {
      providerType: 'clickup',
      displayName: 'ClickUp',
      description:
        'Import ClickUp Docs and Pages from your ClickUp workspace into your knowledge base',
      sourceType: 'clickup-document',
      icon: '/images/integrations/clickup.png',
    };
  }

  /**
   * Get JSON schema for provider configuration
   */
  getConfigSchema(): Record<string, any> {
    return {
      ...CLICKUP_CONFIG_SCHEMA,
    };
  }

  /**
   * Test connection with the given configuration
   */
  async testConnection(
    config: Record<string, any>
  ): Promise<TestConnectionResult> {
    try {
      const clickupConfig = this.validateConfig(config);

      // Test by getting workspaces
      const workspacesResponse = await this.clickupApiService.getWorkspaces(
        clickupConfig.apiToken
      );

      if (!workspacesResponse.teams || workspacesResponse.teams.length === 0) {
        return {
          success: false,
          error:
            'No workspaces found. Please check your API token permissions.',
        };
      }

      // Return first workspace info (user can select which one to use)
      const firstWorkspace = workspacesResponse.teams[0];

      return {
        success: true,
        info: {
          workspaceCount: workspacesResponse.teams.length,
          workspaces: workspacesResponse.teams.map((w) => ({
            id: w.id,
            name: w.name,
          })),
          defaultWorkspace: {
            id: firstWorkspace.id,
            name: firstWorkspace.name,
          },
        },
      };
    } catch (error: any) {
      this.logger.warn(`ClickUp connection test failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Browse available content in ClickUp
   *
   * Structure:
   * - Root: List of workspaces
   * - Workspace: List of spaces
   * - Space: List of docs (preview count)
   */
  async browse(
    config: Record<string, any>,
    options: BrowseOptions
  ): Promise<BrowseResult<ClickUpBrowseItem>> {
    const clickupConfig = this.validateConfig(config);

    try {
      const items: ClickUpBrowseItem[] = [];

      if (!options.folder) {
        // Root level - list workspaces
        const workspacesResponse = await this.clickupApiService.getWorkspaces(
          clickupConfig.apiToken
        );

        for (const workspace of workspacesResponse.teams) {
          items.push({
            id: workspace.id,
            name: workspace.name,
            type: 'workspace',
            path: `/${workspace.name}`,
            isFolder: true,
          });
        }
      } else if (options.folder.startsWith('workspace:')) {
        // Workspace level - list spaces
        const workspaceId = options.folder.replace('workspace:', '');
        const spacesResponse = await this.clickupApiService.getSpaces(
          clickupConfig.apiToken,
          workspaceId,
          clickupConfig.includeArchived
        );

        for (const space of spacesResponse.spaces) {
          items.push({
            id: space.id,
            name: space.name,
            type: 'space',
            path: `/${workspaceId}/${space.name}`,
            isFolder: true,
            archived: space.archived,
          });
        }
      } else if (options.folder.startsWith('space:')) {
        // Space level - list docs
        const [, workspaceId, spaceId] = options.folder.split(':');
        const docsResponse = await this.clickupApiService.getDocs(
          clickupConfig.apiToken,
          workspaceId,
          undefined,
          spaceId,
          'SPACE'
        );

        for (const doc of docsResponse.docs) {
          items.push({
            id: doc.id,
            name: doc.name,
            type: 'doc',
            path: `/${workspaceId}/${spaceId}/${doc.name}`,
            isFolder: false,
            archived: doc.archived,
            metadata: {
              creatorId: doc.creator_id,
              dateCreated: doc.date_created,
              dateUpdated: doc.date_updated,
            },
          });
        }
      }

      return {
        items,
        total: items.length,
        hasMore: false, // Simplified - no pagination for browse
      };
    } catch (error: any) {
      this.logger.error(`Failed to browse ClickUp: ${error.message}`);
      throw error;
    }
  }

  /**
   * Import selected items (docs) as documents
   */
  async import(
    config: Record<string, any>,
    items: ImportItem[],
    projectId: string,
    integrationId: string
  ): Promise<ImportResult> {
    const clickupConfig = this.validateConfig(config);

    const result: ImportResult = {
      totalImported: 0,
      totalFailed: 0,
      totalSkipped: 0,
      documentIds: [],
      errors: [],
    };

    // Ensure we have a workspace ID
    if (!clickupConfig.workspaceId) {
      result.totalFailed = items.length;
      result.errors.push({
        itemId: 'config',
        error: 'Workspace ID not configured. Please test connection first.',
      });
      return result;
    }

    for (const item of items) {
      try {
        // Get doc metadata
        const doc = await this.clickupApiService.getDoc(
          clickupConfig.apiToken,
          clickupConfig.workspaceId,
          item.id
        );

        // Fetch all pages for this doc
        let pagesContent = '';
        let pageCount = 0;

        try {
          const pages = await this.clickupApiService.getDocPages(
            clickupConfig.apiToken,
            clickupConfig.workspaceId,
            item.id
          );
          pageCount = pages.length;
          pagesContent = this.combinePageContent(pages);
        } catch (error: any) {
          this.logger.warn(
            `Failed to fetch pages for doc ${item.id}: ${error.message}`
          );
        }

        // Check for existing document by clickupDocId
        const existing = await this.documentRepo
          .createQueryBuilder('doc')
          .where('doc.projectId = :projectId', { projectId })
          .andWhere('doc.dataSourceIntegrationId = :integrationId', {
            integrationId,
          })
          .andWhere("doc.metadata->>'clickupDocId' = :docId", {
            docId: doc.id,
          })
          .getOne();

        if (existing) {
          // Check if doc was modified
          const existingModTime = existing.metadata?.clickupUpdatedAt;
          if (existingModTime === doc.date_updated) {
            result.totalSkipped++;
            continue;
          }

          // Update existing document
          const updatedDoc = await this.updateDocumentFromClickUp(
            existing,
            doc,
            pagesContent,
            pageCount,
            clickupConfig,
            integrationId
          );
          result.documentIds.push(updatedDoc.id);
          result.totalImported++;
        } else {
          // Create new document
          const newDoc = await this.createDocumentFromClickUp(
            doc,
            pagesContent,
            pageCount,
            projectId,
            integrationId,
            clickupConfig
          );
          result.documentIds.push(newDoc.id);
          result.totalImported++;
        }
      } catch (error: any) {
        this.logger.error(`Failed to import doc ${item.id}: ${error.message}`);
        result.totalFailed++;
        result.errors.push({
          itemId: item.id,
          error: error.message,
        });
      }
    }

    return result;
  }

  /**
   * Get new items since last sync
   * Note: ClickUp doesn't have a changes API, so we fetch all docs and filter by date
   */
  async getNewItems(
    config: Record<string, any>,
    since: Date,
    options?: SyncOptions
  ): Promise<ImportItem[]> {
    const clickupConfig = this.validateConfig(config);
    const limit = options?.limit || 100;
    const items: ImportItem[] = [];

    if (!clickupConfig.workspaceId) {
      this.logger.warn('Cannot get new items: workspace ID not configured');
      return items;
    }

    try {
      // Get selected space IDs or all spaces
      let spaceIds: string[] = [];

      if (
        clickupConfig.selectedSpaces &&
        clickupConfig.selectedSpaces.length > 0
      ) {
        spaceIds = clickupConfig.selectedSpaces.map((s) => s.id);
      } else {
        // Get all spaces
        const spacesResponse = await this.clickupApiService.getSpaces(
          clickupConfig.apiToken,
          clickupConfig.workspaceId,
          clickupConfig.includeArchived
        );
        spaceIds = spacesResponse.spaces.map((s) => s.id);
      }

      const sinceTimestamp = since.getTime();

      // Fetch docs from each space
      for (const spaceId of spaceIds) {
        if (items.length >= limit) break;

        try {
          const docsResponse = await this.clickupApiService.getDocs(
            clickupConfig.apiToken,
            clickupConfig.workspaceId,
            undefined,
            spaceId,
            'SPACE'
          );

          for (const doc of docsResponse.docs) {
            if (items.length >= limit) break;

            // Filter by date_updated
            const docUpdated = parseInt(doc.date_updated, 10);
            if (docUpdated > sinceTimestamp) {
              items.push({
                id: doc.id,
                metadata: {
                  name: doc.name,
                  dateUpdated: doc.date_updated,
                  spaceId,
                },
              });
            }
          }
        } catch (error: any) {
          this.logger.warn(
            `Failed to fetch docs from space ${spaceId}: ${error.message}`
          );
        }
      }

      this.logger.log(
        `Found ${items.length} docs updated since ${since.toISOString()}`
      );
      return items;
    } catch (error: any) {
      this.logger.error(`Failed to get new items: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get sync preview with doc counts
   */
  async getSyncPreview(
    config: Record<string, any>,
    options?: SyncOptions,
    importedCount?: number,
    lastSyncedAt?: Date | null
  ): Promise<SyncPreviewResult> {
    const clickupConfig = this.validateConfig(config);

    try {
      const folders: FolderStats[] = [];
      let totalDocs = 0;
      let newDocs = 0;

      if (!clickupConfig.workspaceId) {
        return {
          folders: [],
          totalEmails: 0,
          totalUnread: 0,
          matchingEmails: 0,
          importedEmails: importedCount || 0,
          newEmails: 0,
          lastSyncedAt: lastSyncedAt || undefined,
        };
      }

      // Get selected space IDs or all spaces
      let spaceIds: string[] = [];
      const spaceNames = new Map<string, string>();

      if (
        clickupConfig.selectedSpaces &&
        clickupConfig.selectedSpaces.length > 0
      ) {
        spaceIds = clickupConfig.selectedSpaces.map((s) => s.id);
        clickupConfig.selectedSpaces.forEach((s) =>
          spaceNames.set(s.id, s.name)
        );
      } else {
        // Get all spaces
        const spacesResponse = await this.clickupApiService.getSpaces(
          clickupConfig.apiToken,
          clickupConfig.workspaceId,
          clickupConfig.includeArchived
        );
        spaceIds = spacesResponse.spaces.map((s) => s.id);
        spacesResponse.spaces.forEach((s) => spaceNames.set(s.id, s.name));
      }

      const sinceTimestamp = lastSyncedAt?.getTime() || 0;

      // Count docs per space
      for (const spaceId of spaceIds) {
        try {
          const docsResponse = await this.clickupApiService.getDocs(
            clickupConfig.apiToken,
            clickupConfig.workspaceId,
            undefined,
            spaceId,
            'SPACE'
          );

          const spaceDocCount = docsResponse.docs.length;
          totalDocs += spaceDocCount;

          // Count new docs
          const newInSpace = docsResponse.docs.filter(
            (doc) => parseInt(doc.date_updated, 10) > sinceTimestamp
          ).length;
          newDocs += newInSpace;

          folders.push({
            path: spaceId,
            name: spaceNames.get(spaceId) || spaceId,
            totalMessages: spaceDocCount,
            unreadMessages: newInSpace,
          });
        } catch (error: any) {
          this.logger.warn(
            `Failed to count docs in space ${spaceId}: ${error.message}`
          );
        }
      }

      return {
        folders,
        totalEmails: totalDocs,
        totalUnread: newDocs,
        matchingEmails: totalDocs,
        importedEmails: importedCount || 0,
        newEmails: newDocs,
        lastSyncedAt: lastSyncedAt || undefined,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get sync preview: ${error.message}`);
      throw error;
    }
  }

  // ---------- Helper methods ----------

  /**
   * Validate and convert config to ClickUpConfigDto
   */
  private validateConfig(config: Record<string, any>): ClickUpConfigDto {
    if (!config.apiToken) {
      throw new Error('Invalid ClickUp configuration: API token is required');
    }

    return {
      apiToken: config.apiToken,
      workspaceId: config.workspaceId,
      workspaceName: config.workspaceName,
      selectedSpaces: config.selectedSpaces,
      includeArchived: config.includeArchived,
      lastSyncedAt: config.lastSyncedAt,
    };
  }

  /**
   * Combine page content recursively
   */
  private combinePageContent(pages: ClickUpPage[], level: number = 2): string {
    let combined = '';

    for (const page of pages) {
      if (!page.name) continue;

      // Add page heading
      const headerPrefix = '#'.repeat(level);
      combined += `${headerPrefix} ${page.name}\n\n`;

      // Add page content
      if (page.content) {
        combined += `${page.content}\n\n`;
      }

      // Recursively add nested pages
      if (page.pages && page.pages.length > 0) {
        combined += this.combinePageContent(page.pages, level + 1);
      }
    }

    return combined;
  }

  /**
   * Create a document from a ClickUp doc
   */
  private async createDocumentFromClickUp(
    doc: any,
    pagesContent: string,
    pageCount: number,
    projectId: string,
    integrationId: string,
    config: ClickUpConfigDto
  ): Promise<Document> {
    // Build metadata
    const metadata: ClickUpDocumentMetadata = {
      clickupDocId: doc.id,
      clickupWorkspaceId: config.workspaceId!,
      clickupSpaceId: doc.parent?.type === 6 ? doc.parent.id : undefined,
      creatorId: doc.creator_id,
      clickupCreatedAt: doc.date_created,
      clickupUpdatedAt: doc.date_updated,
      avatar: doc.avatar?.value,
      archived: doc.archived,
      pageCount,
      provider: 'clickup',
    };

    // Combine doc name with pages content
    const content = pagesContent
      ? `# ${doc.name}\n\n${pagesContent}`
      : `# ${doc.name}\n\n[No content]`;

    const document = this.documentRepo.create({
      projectId,
      sourceType: 'clickup-document',
      dataSourceIntegrationId: integrationId,
      filename: doc.name,
      content,
      mimeType: 'text/markdown',
      metadata: metadata as any,
      conversionStatus: 'not_required',
    });

    const savedDoc = await this.documentRepo.save(document);

    // Create chunks for the document
    try {
      await this.documentsService.recreateChunks(savedDoc.id);
      this.logger.debug(`Created chunks for ClickUp document ${savedDoc.id}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to create chunks for ClickUp document ${savedDoc.id}: ${error.message}`
      );
    }

    return savedDoc;
  }

  /**
   * Update an existing document from a ClickUp doc
   */
  private async updateDocumentFromClickUp(
    existing: Document,
    doc: any,
    pagesContent: string,
    pageCount: number,
    config: ClickUpConfigDto,
    integrationId: string
  ): Promise<Document> {
    // Build metadata
    const metadata: ClickUpDocumentMetadata = {
      ...((existing.metadata as any) || {}),
      clickupDocId: doc.id,
      clickupWorkspaceId: config.workspaceId!,
      clickupSpaceId: doc.parent?.type === 6 ? doc.parent.id : undefined,
      creatorId: doc.creator_id,
      clickupCreatedAt: doc.date_created,
      clickupUpdatedAt: doc.date_updated,
      avatar: doc.avatar?.value,
      archived: doc.archived,
      pageCount,
      provider: 'clickup',
    };

    // Combine doc name with pages content
    const content = pagesContent
      ? `# ${doc.name}\n\n${pagesContent}`
      : `# ${doc.name}\n\n[No content]`;

    existing.content = content;
    existing.filename = doc.name;
    existing.metadata = metadata as any;

    const savedDoc = await this.documentRepo.save(existing);

    // Recreate chunks for the document
    try {
      await this.documentsService.recreateChunks(savedDoc.id);
      this.logger.debug(`Recreated chunks for ClickUp document ${savedDoc.id}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to recreate chunks for ClickUp document ${savedDoc.id}: ${error.message}`
      );
    }

    return savedDoc;
  }
}

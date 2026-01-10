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
import { GoogleOAuthService } from '../gmail-oauth/google-oauth.service';
import {
  GoogleDriveApiService,
  GOOGLE_WORKSPACE_EXPORTS,
} from './google-drive-api.service';
import {
  GoogleDriveConfigDto,
  GOOGLE_DRIVE_CONFIG_SCHEMA,
  DriveDocumentMetadata,
  FolderMode,
} from './dto';
import { Document } from '../../../../entities/document.entity';
import { Project } from '../../../../entities/project.entity';
import { DocumentsService } from '../../../documents/documents.service';
import { StorageService } from '../../../storage/storage.service';
import { DocumentParsingJobService } from '../../../document-parsing/document-parsing-job.service';
import { shouldUseKreuzberg } from '../../../document-parsing/interfaces';

/**
 * Google Drive Provider
 *
 * Implements the DataSourceProvider interface for Google Drive using OAuth 2.0.
 * Supports browsing, importing, and syncing files from Google Drive.
 */
@Injectable()
export class GoogleDriveProvider implements DataSourceProvider {
  private readonly logger = new Logger(GoogleDriveProvider.name);

  constructor(
    private readonly driveApiService: GoogleDriveApiService,
    private readonly googleOAuthService: GoogleOAuthService,
    @InjectRepository(Document)
    private readonly documentRepo: Repository<Document>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @Inject(forwardRef(() => DocumentsService))
    private readonly documentsService: DocumentsService,
    private readonly storageService: StorageService,
    private readonly parsingJobService: DocumentParsingJobService
  ) {}

  /**
   * Get provider metadata
   */
  getMetadata(): ProviderMetadata {
    return {
      providerType: 'google_drive',
      displayName: 'Google Drive',
      description:
        'Connect to Google Drive using your Google account to import files and documents',
      sourceType: 'drive',
      icon: '/images/integrations/google-drive.png',
    };
  }

  /**
   * Get JSON schema for provider configuration
   */
  getConfigSchema(): Record<string, any> {
    return {
      ...GOOGLE_DRIVE_CONFIG_SCHEMA,
      // Add OAuth indicator for frontend
      'x-oauth': {
        provider: 'google',
        authUrl: '/data-source-integrations/oauth/google/start',
        configured: this.googleOAuthService.isConfigured(),
      },
    };
  }

  /**
   * Test connection with the given configuration
   */
  async testConnection(
    config: Record<string, any>
  ): Promise<TestConnectionResult> {
    try {
      const driveConfig = this.validateConfig(config);

      // Test by getting user info
      const userInfo = await this.driveApiService.getUserInfo(driveConfig);

      return {
        success: true,
        info: {
          email: userInfo.email,
          displayName: userInfo.displayName,
        },
      };
    } catch (error: any) {
      this.logger.warn(`Google Drive connection test failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Browse available files and folders in Google Drive
   */
  async browse(
    config: Record<string, any>,
    options: BrowseOptions
  ): Promise<BrowseResult> {
    const driveConfig = this.validateConfig(config);

    try {
      const result = await this.driveApiService.browseFolders(driveConfig, {
        folderId: options.folder,
        pageSize: options.limit || 50,
      });

      const items = result.items.map((item) => ({
        ...item,
        itemId: item.id,
      }));

      // Add shared drives as special items at the root level
      if (
        result.sharedDrives &&
        result.sharedDrives.length > 0 &&
        !options.folder
      ) {
        const sharedDriveItems = result.sharedDrives.map((drive) => ({
          id: drive.id,
          itemId: `shared_drive:${drive.id}`,
          name: drive.name,
          path: `Shared Drives/${drive.name}`,
          isFolder: true,
          mimeType: 'application/vnd.google-apps.folder',
          isSharedDrive: true,
        }));
        items.unshift(...sharedDriveItems);
      }

      return {
        items,
        total: items.length,
        hasMore: !!result.nextPageToken,
        nextOffset: result.nextPageToken
          ? (options.offset || 0) + (options.limit || 50)
          : undefined,
      };
    } catch (error: any) {
      this.logger.error(`Failed to browse Google Drive: ${error.message}`);
      throw error;
    }
  }

  /**
   * Import selected items as documents
   */
  async import(
    config: Record<string, any>,
    items: ImportItem[],
    projectId: string,
    integrationId: string
  ): Promise<ImportResult> {
    const driveConfig = this.validateConfig(config);

    const result: ImportResult = {
      totalImported: 0,
      totalFailed: 0,
      totalSkipped: 0,
      documentIds: [],
      errors: [],
    };

    for (const item of items) {
      try {
        // Get file metadata
        const file = await this.driveApiService.getFile(driveConfig, item.id);

        // Check if should process
        if (!this.driveApiService.shouldProcessFile(file, driveConfig)) {
          this.logger.debug(`Skipping file ${file.name} - not processable`);
          result.totalSkipped++;
          continue;
        }

        // Check for duplicate by driveFileId
        const existing = await this.documentRepo
          .createQueryBuilder('doc')
          .where('doc.projectId = :projectId', { projectId })
          .andWhere('doc.dataSourceIntegrationId = :integrationId', {
            integrationId,
          })
          .andWhere("doc.metadata->>'driveFileId' = :fileId", {
            fileId: file.id,
          })
          .getOne();

        if (existing) {
          // Check if file was modified
          const existingModTime = existing.metadata?.driveModifiedTime;
          if (existingModTime === file.modifiedTime) {
            result.totalSkipped++;
            continue;
          }

          // Update existing document
          const doc = await this.updateDocumentFromFile(
            existing,
            file,
            driveConfig,
            integrationId
          );
          result.documentIds.push(doc.id);
          result.totalImported++;
        } else {
          // Create new document
          const doc = await this.createDocumentFromFile(
            file,
            projectId,
            integrationId,
            driveConfig
          );
          result.documentIds.push(doc.id);
          result.totalImported++;
        }
      } catch (error: any) {
        this.logger.error(`Failed to import file ${item.id}: ${error.message}`);
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
   * Get new items since last sync using change tokens
   */
  async getNewItems(
    config: Record<string, any>,
    since: Date,
    options?: SyncOptions
  ): Promise<ImportItem[]> {
    const driveConfig = this.validateConfig(config);
    const limit = options?.limit || 100;
    const items: ImportItem[] = [];

    try {
      // If we have a change token, use incremental sync
      if (driveConfig.changeToken && options?.incrementalOnly !== false) {
        const { changes, newStartPageToken } =
          await this.driveApiService.listAllChanges(
            driveConfig,
            driveConfig.changeToken
          );

        // Update config with new token (caller should persist this)
        driveConfig.changeToken = newStartPageToken;

        for (const change of changes) {
          if (items.length >= limit) break;

          // Skip removed files
          if (change.removed) continue;

          const file = change.file;
          if (!file) continue;

          // Check if file should be processed
          if (!this.driveApiService.shouldProcessFile(file, driveConfig)) {
            continue;
          }

          // Check if file is in selected folders
          if (!this.driveApiService.isInSelectedFolders(file, driveConfig)) {
            continue;
          }

          items.push({
            id: file.id,
            metadata: {
              name: file.name,
              mimeType: file.mimeType,
              modifiedTime: file.modifiedTime,
            },
          });
        }
      } else {
        // Initial sync - get all files based on folder selection
        const files = await this.getFilesForSync(driveConfig, limit);

        for (const file of files) {
          if (!this.driveApiService.shouldProcessFile(file, driveConfig)) {
            continue;
          }

          items.push({
            id: file.id,
            metadata: {
              name: file.name,
              mimeType: file.mimeType,
              modifiedTime: file.modifiedTime,
            },
          });
        }

        // Get initial change token for future incremental syncs
        if (!driveConfig.changeToken) {
          driveConfig.changeToken =
            await this.driveApiService.getStartPageToken(driveConfig);
        }
      }

      this.logger.log(`Found ${items.length} files to sync (limit: ${limit})`);
      return items;
    } catch (error: any) {
      this.logger.error(`Failed to get new items: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get sync preview with folder stats and file counts
   */
  async getSyncPreview(
    config: Record<string, any>,
    options?: SyncOptions,
    importedCount?: number,
    lastSyncedAt?: Date | null
  ): Promise<SyncPreviewResult> {
    const driveConfig = this.validateConfig(config);

    try {
      const folders: FolderStats[] = [];
      let totalFiles = 0;
      let matchingFiles = 0;

      // Get files based on folder selection
      const files = await this.getFilesForSync(driveConfig, 1000);

      // Count by folder
      const folderCounts = new Map<string, number>();
      for (const file of files) {
        const parentId = file.parents?.[0] || 'root';
        folderCounts.set(parentId, (folderCounts.get(parentId) || 0) + 1);
        totalFiles++;

        if (this.driveApiService.shouldProcessFile(file, driveConfig)) {
          matchingFiles++;
        }
      }

      // Build folder stats
      for (const [folderId, count] of folderCounts) {
        try {
          const folder = await this.driveApiService.getFile(
            driveConfig,
            folderId
          );
          folders.push({
            path: folderId,
            name: folder.name || folderId,
            totalMessages: count,
            unreadMessages: 0,
          });
        } catch {
          folders.push({
            path: folderId,
            name: folderId === 'root' ? 'My Drive' : folderId,
            totalMessages: count,
            unreadMessages: 0,
          });
        }
      }

      // Count new files (would need change token for accurate count)
      let newFiles = matchingFiles;
      if (lastSyncedAt && driveConfig.changeToken) {
        try {
          const { changes } = await this.driveApiService.listAllChanges(
            driveConfig,
            driveConfig.changeToken
          );
          newFiles = changes.filter(
            (c) =>
              !c.removed &&
              c.file &&
              this.driveApiService.shouldProcessFile(c.file, driveConfig)
          ).length;
        } catch {
          // Fall back to total matching
        }
      }

      return {
        folders,
        totalEmails: totalFiles,
        totalUnread: 0,
        matchingEmails: matchingFiles,
        importedEmails: importedCount || 0,
        newEmails: newFiles,
        lastSyncedAt: lastSyncedAt || undefined,
        appliedFilters: options?.filters,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get sync preview: ${error.message}`);
      throw error;
    }
  }

  // ---------- Helper methods ----------

  /**
   * Validate and convert config to GoogleDriveConfigDto
   */
  private validateConfig(config: Record<string, any>): GoogleDriveConfigDto {
    if (!config.email || !config.accessToken || !config.refreshToken) {
      throw new Error(
        'Invalid Google Drive configuration: OAuth authentication required. Please reconnect your Google account.'
      );
    }

    return {
      email: config.email,
      accessToken: config.accessToken,
      refreshToken: config.refreshToken,
      expiresAt: config.expiresAt,
      scope: config.scope,
      folderMode: config.folderMode,
      selectedFolders: config.selectedFolders,
      selectedSharedDrives: config.selectedSharedDrives,
      fileFilters: config.fileFilters,
      changeToken: config.changeToken,
      lastFullSyncAt: config.lastFullSyncAt,
    };
  }

  /**
   * Get files for sync based on folder selection mode
   * Now uses recursive fetching with exclusion support
   */
  private async getFilesForSync(
    config: GoogleDriveConfigDto,
    maxFiles: number
  ): Promise<any[]> {
    const allFiles: any[] = [];
    const excludeSet = new Set((config.excludedFolders || []).map((f) => f.id));

    switch (config.folderMode) {
      case FolderMode.SPECIFIC: {
        // Get files recursively from each selected folder
        for (const folder of config.selectedFolders || []) {
          if (allFiles.length >= maxFiles) break;

          const { files } = await this.driveApiService.listAllFilesRecursively(
            config,
            {
              folderId: folder.id,
              maxFiles: maxFiles - allFiles.length,
              excludeFolderIds: excludeSet,
            }
          );
          allFiles.push(...files);
        }
        break;
      }

      case FolderMode.SHARED_DRIVES: {
        // Get files recursively from each selected Shared Drive
        for (const drive of config.selectedSharedDrives || []) {
          if (allFiles.length >= maxFiles) break;

          const { files } = await this.driveApiService.listAllFilesRecursively(
            config,
            {
              driveId: drive.id,
              maxFiles: maxFiles - allFiles.length,
              excludeFolderIds: excludeSet,
            }
          );
          allFiles.push(...files);
        }
        break;
      }

      case FolderMode.ALL:
      default: {
        // Get all files from My Drive recursively
        const { files } = await this.driveApiService.listAllFilesRecursively(
          config,
          {
            maxFiles,
            excludeFolderIds: excludeSet,
          }
        );
        allFiles.push(...files);
        break;
      }
    }

    return allFiles;
  }

  /**
   * Get estimated file count for a folder (recursive)
   */
  async getFolderFileCount(
    config: Record<string, any>,
    folderId: string
  ): Promise<{ estimatedCount: number; isExact: boolean }> {
    const driveConfig = this.validateConfig(config);
    return this.driveApiService.countFilesRecursively(driveConfig, {
      folderId,
    });
  }

  /**
   * Create a document from a Drive file
   */
  private async createDocumentFromFile(
    file: any,
    projectId: string,
    integrationId: string,
    config: GoogleDriveConfigDto
  ): Promise<Document> {
    // Download file content
    const { content, exportedMimeType } =
      await this.driveApiService.downloadFile(config, file.id, file.mimeType);

    // Determine actual MIME type - use exportedMimeType for Google Docs, otherwise original
    const actualMimeType =
      exportedMimeType || file.mimeType || 'application/octet-stream';

    // Check if this is a binary file that needs conversion
    const isBinary = typeof content !== 'string';
    const requiresConversion =
      isBinary && shouldUseKreuzberg(actualMimeType, file.name);

    // Build metadata
    const metadata: DriveDocumentMetadata = {
      driveFileId: file.id,
      driveFolderId: file.parents?.[0],
      mimeType: file.mimeType,
      exportedMimeType,
      fileSizeBytes: file.size ? parseInt(file.size, 10) : undefined,
      webViewLink: file.webViewLink,
      webContentLink: file.webContentLink,
      driveCreatedTime: file.createdTime,
      driveModifiedTime: file.modifiedTime,
      provider: 'google_drive',
    };

    // Add shared drive info if applicable
    if (file.driveId) {
      metadata.sharedDriveId = file.driveId;
    }

    // For binary files requiring conversion, we need to upload to storage and create a parsing job
    let storageKey: string | undefined;
    let storageUrl: string | undefined;
    let textContent: string;
    let fileSizeBytes: number | undefined;

    if (isBinary && requiresConversion) {
      // Get organization ID for storage
      const project = await this.projectRepo.findOne({
        where: { id: projectId },
        select: ['id', 'organizationId'],
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      const buffer = content as Buffer;
      fileSizeBytes = buffer.length;

      // Upload binary content to storage
      const uploadResult = await this.storageService.uploadDocument(buffer, {
        orgId: project.organizationId,
        projectId,
        filename: file.name,
        contentType: actualMimeType,
      });

      storageKey = uploadResult.key;
      storageUrl = uploadResult.storageUrl;
      textContent = ''; // Content will be populated after conversion
    } else if (isBinary) {
      // Binary file that doesn't need conversion (e.g., unsupported type)
      textContent = `[Binary file: ${file.name}]`;
    } else {
      // Text content
      textContent = content as string;
    }

    // Determine final MIME type for the document
    const finalMimeType =
      exportedMimeType ||
      (file.mimeType.startsWith('text/') ? file.mimeType : actualMimeType);

    const doc = this.documentRepo.create({
      projectId,
      sourceType: 'drive',
      dataSourceIntegrationId: integrationId,
      filename: file.name,
      content: textContent,
      mimeType: finalMimeType,
      storageKey,
      storageUrl,
      fileSizeBytes:
        fileSizeBytes || (file.size ? parseInt(file.size, 10) : undefined),
      metadata: metadata as any,
      conversionStatus: requiresConversion ? 'pending' : 'not_required',
    });

    const savedDoc = await this.documentRepo.save(doc);

    // Create parsing job for binary files that need conversion
    if (isBinary && requiresConversion && storageKey) {
      const project = await this.projectRepo.findOne({
        where: { id: projectId },
        select: ['id', 'organizationId'],
      });

      if (project) {
        await this.parsingJobService.createJob({
          organizationId: project.organizationId,
          projectId,
          sourceType: 'drive',
          sourceFilename: file.name,
          mimeType: actualMimeType,
          fileSizeBytes: fileSizeBytes || 0,
          storageKey,
          documentId: savedDoc.id,
          maxRetries: 3,
          metadata: {
            driveFileId: file.id,
            webViewLink: file.webViewLink,
          },
        });

        this.logger.debug(
          `Created parsing job for drive file: ${file.name} (doc: ${savedDoc.id})`
        );
      }
    } else if (!isBinary) {
      // Create chunks for text content
      try {
        await this.documentsService.recreateChunks(savedDoc.id);
        this.logger.debug(`Created chunks for drive document ${savedDoc.id}`);
      } catch (error: any) {
        this.logger.error(
          `Failed to create chunks for drive document ${savedDoc.id}: ${error.message}`
        );
      }
    }

    return savedDoc;
  }

  /**
   * Update an existing document from a Drive file
   */
  private async updateDocumentFromFile(
    existing: Document,
    file: any,
    config: GoogleDriveConfigDto,
    integrationId: string
  ): Promise<Document> {
    // Download file content
    const { content, exportedMimeType } =
      await this.driveApiService.downloadFile(config, file.id, file.mimeType);

    // Determine actual MIME type
    const actualMimeType =
      exportedMimeType || file.mimeType || 'application/octet-stream';

    // Check if this is a binary file that needs conversion
    const isBinary = typeof content !== 'string';
    const requiresConversion =
      isBinary && shouldUseKreuzberg(actualMimeType, file.name);

    // Update metadata
    const metadata: DriveDocumentMetadata = {
      ...((existing.metadata as any) || {}),
      driveFileId: file.id,
      driveFolderId: file.parents?.[0],
      mimeType: file.mimeType,
      exportedMimeType,
      fileSizeBytes: file.size ? parseInt(file.size, 10) : undefined,
      webViewLink: file.webViewLink,
      webContentLink: file.webContentLink,
      driveModifiedTime: file.modifiedTime,
      provider: 'google_drive',
    };

    // For binary files requiring conversion, upload to storage and create parsing job
    let storageKey: string | undefined = existing.storageKey || undefined;
    let storageUrl: string | undefined = existing.storageUrl || undefined;
    let textContent: string;
    let fileSizeBytes: number | undefined;

    const projectId = existing.projectId!;

    if (isBinary && requiresConversion) {
      // Get organization ID for storage
      const project = await this.projectRepo.findOne({
        where: { id: projectId },
        select: ['id', 'organizationId'],
      });

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      const buffer = content as Buffer;
      fileSizeBytes = buffer.length;

      // Upload binary content to storage (replace if exists)
      const uploadResult = await this.storageService.uploadDocument(buffer, {
        orgId: project.organizationId,
        projectId,
        filename: file.name,
        contentType: actualMimeType,
      });

      storageKey = uploadResult.key;
      storageUrl = uploadResult.storageUrl;
      textContent = ''; // Content will be populated after conversion
    } else if (isBinary) {
      textContent = `[Binary file: ${file.name}]`;
    } else {
      textContent = content as string;
    }

    // Update document
    existing.content = textContent;
    existing.filename = file.name;
    existing.metadata = metadata as any;
    existing.mimeType =
      exportedMimeType ||
      (file.mimeType.startsWith('text/') ? file.mimeType : actualMimeType);
    existing.storageKey = storageKey || null;
    existing.storageUrl = storageUrl || null;
    existing.fileSizeBytes =
      fileSizeBytes || (file.size ? parseInt(file.size, 10) : null);
    existing.conversionStatus = requiresConversion ? 'pending' : 'not_required';

    const savedDoc = await this.documentRepo.save(existing);

    // Create parsing job for binary files that need conversion
    if (isBinary && requiresConversion && storageKey) {
      const project = await this.projectRepo.findOne({
        where: { id: projectId },
        select: ['id', 'organizationId'],
      });

      if (project) {
        await this.parsingJobService.createJob({
          organizationId: project.organizationId,
          projectId,
          sourceType: 'drive',
          sourceFilename: file.name,
          mimeType: actualMimeType,
          fileSizeBytes: fileSizeBytes || 0,
          storageKey,
          documentId: savedDoc.id,
          maxRetries: 3,
          metadata: {
            driveFileId: file.id,
            webViewLink: file.webViewLink,
            isUpdate: true,
          },
        });

        this.logger.debug(
          `Created parsing job for updated drive file: ${file.name} (doc: ${savedDoc.id})`
        );
      }
    } else if (!isBinary) {
      // Recreate chunks for text content
      try {
        await this.documentsService.recreateChunks(savedDoc.id);
        this.logger.debug(`Recreated chunks for drive document ${savedDoc.id}`);
      } catch (error: any) {
        this.logger.error(
          `Failed to recreate chunks for drive document ${savedDoc.id}: ${error.message}`
        );
      }
    }

    return savedDoc;
  }
}

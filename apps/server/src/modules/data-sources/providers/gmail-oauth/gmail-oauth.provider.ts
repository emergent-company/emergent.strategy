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
  SyncLogger,
} from '../provider.interface';
import { ImapConnectionService } from '../imap/imap-connection.service';
import { GoogleOAuthService } from './google-oauth.service';
import {
  GmailOAuthConfigDto,
  GMAIL_OAUTH_CONFIG_SCHEMA,
  GMAIL_IMAP_CONFIG,
} from './dto';
import {
  ImapConfigDto,
  ImapSecurity,
  ImapFilterDto,
  ImapEmailFullDto,
} from '../imap/dto';
import { Document } from '../../../../entities/document.entity';
import { Project } from '../../../../entities/project.entity';
import { DocumentsService } from '../../../documents/documents.service';
import { StorageService } from '../../../storage/storage.service';
import { DocumentParsingJobService } from '../../../document-parsing/document-parsing-job.service';
import { shouldUseKreuzberg } from '../../../document-parsing/interfaces';

/**
 * Gmail OAuth Provider
 *
 * Implements the DataSourceProvider interface for Gmail using OAuth 2.0.
 * Uses IMAP with XOAUTH2 authentication for email access.
 */
@Injectable()
export class GmailOAuthProvider implements DataSourceProvider {
  private readonly logger = new Logger(GmailOAuthProvider.name);

  constructor(
    private readonly imapConnectionService: ImapConnectionService,
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
      providerType: 'gmail_oauth',
      displayName: 'Gmail',
      description:
        'Connect to Gmail using your Google account to import emails securely',
      sourceType: 'email',
      icon: '/images/integrations/gmail.png',
    };
  }

  /**
   * Get JSON schema for provider configuration
   */
  getConfigSchema(): Record<string, any> {
    return {
      ...GMAIL_OAUTH_CONFIG_SCHEMA,
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
      const gmailConfig = this.validateConfig(config);

      // Ensure we have a valid access token
      const imapConfig = await this.getImapConfig(gmailConfig);

      // Test IMAP connection
      return this.imapConnectionService.testConnection(imapConfig);
    } catch (error: any) {
      this.logger.warn(`Gmail connection test failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Browse available emails in Gmail
   */
  async browse(
    config: Record<string, any>,
    options: BrowseOptions
  ): Promise<BrowseResult> {
    const gmailConfig = this.validateConfig(config);
    const imapConfig = await this.getImapConfig(gmailConfig);

    let client = null;
    try {
      client = await this.imapConnectionService.connect(imapConfig);

      const folder = options.folder || 'INBOX';
      const imapFilter = this.convertToImapFilter(options.filters);

      const result = await this.imapConnectionService.browseEmails(
        client,
        folder,
        imapFilter,
        options.offset || 0,
        options.limit || 50
      );

      const items = result.emails.map((email) => ({
        ...email,
        itemId: `${folder}:${email.uid}`,
      }));

      return {
        items,
        total: result.total,
        hasMore: result.hasMore,
        nextOffset: result.hasMore
          ? (options.offset || 0) + (options.limit || 50)
          : undefined,
      };
    } finally {
      if (client) {
        try {
          await client.logout();
        } catch {
          // Ignore logout errors
        }
      }
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
    this.logger.log(`Starting import of ${items.length} items`);

    const gmailConfig = this.validateConfig(config);
    const imapConfig = await this.getImapConfig(gmailConfig);

    const result: ImportResult = {
      totalImported: 0,
      totalFailed: 0,
      totalSkipped: 0,
      documentIds: [],
      errors: [],
    };

    let client = null;
    try {
      this.logger.debug('Connecting to IMAP for import...');
      client = await this.imapConnectionService.connect(imapConfig);
      this.logger.debug('Connected to IMAP');

      // Group items by folder
      const itemsByFolder = new Map<string, number[]>();
      for (const item of items) {
        const [folder, uidStr] = this.parseItemId(item.id);
        const uid = parseInt(uidStr, 10);

        if (!itemsByFolder.has(folder)) {
          itemsByFolder.set(folder, []);
        }
        itemsByFolder.get(folder)!.push(uid);
      }

      // Process each folder
      for (const [folder, uids] of itemsByFolder) {
        this.logger.log(`Importing ${uids.length} emails from ${folder}`);

        this.logger.debug(`Fetching emails from ${folder}...`);
        const emails = await this.imapConnectionService.fetchEmails(
          client,
          folder,
          uids
        );
        this.logger.debug(`Fetched ${emails.length} emails from ${folder}`);

        for (let i = 0; i < emails.length; i++) {
          const email = emails[i];
          const itemId = `${folder}:${email.uid}`;

          this.logger.debug(
            `Processing email ${i + 1}/${emails.length}: ${itemId}`
          );

          try {
            // Check for duplicate
            if (email.messageId) {
              const existing = await this.documentRepo
                .createQueryBuilder('doc')
                .where('doc.projectId = :projectId', { projectId })
                .andWhere('doc.sourceType = :sourceType', {
                  sourceType: 'email',
                })
                .andWhere("doc.metadata->>'messageId' = :messageId", {
                  messageId: email.messageId,
                })
                .getOne();

              if (existing) {
                this.logger.debug(`Skipping duplicate: ${itemId}`);
                result.totalSkipped++;
                continue;
              }
            }

            // Create document
            const doc = await this.createEmailDocument(
              email,
              projectId,
              integrationId,
              folder
            );

            result.documentIds.push(doc.id);
            result.totalImported++;
            this.logger.debug(`Imported email ${itemId} as document ${doc.id}`);

            // Import attachments as child documents
            if (email.hasAttachments && email.bodyStructure) {
              const attachmentParts =
                this.imapConnectionService.extractAttachmentPartsFromStructure(
                  email.bodyStructure
                );

              if (attachmentParts.length > 0) {
                this.logger.log(
                  `Importing ${attachmentParts.length} attachments for email ${email.messageId}`
                );

                const attResult = await this.importAttachments(
                  client,
                  folder,
                  email,
                  attachmentParts,
                  doc.id,
                  projectId,
                  integrationId
                );

                // Add attachment document IDs to result
                result.documentIds.push(...attResult.documentIds);

                this.logger.log(
                  `Imported ${attResult.imported} attachments, ${attResult.failed} failed for email ${doc.id}`
                );
              }
            }
          } catch (error: any) {
            this.logger.error(
              `Failed to import email ${itemId}: ${error.message}`
            );
            result.totalFailed++;
            result.errors.push({
              itemId,
              error: error.message,
            });
          }
        }
      }

      this.logger.log(
        `Import complete: ${result.totalImported} imported, ${result.totalSkipped} skipped, ${result.totalFailed} failed`
      );
      return result;
    } finally {
      if (client) {
        try {
          this.logger.debug('Disconnecting from IMAP...');
          await client.logout();
          this.logger.debug('Disconnected from IMAP');
        } catch {
          // Ignore
        }
      }
    }
  }

  /**
   * Get new items since last sync
   */
  async getNewItems(
    config: Record<string, any>,
    since: Date,
    options?: SyncOptions
  ): Promise<ImportItem[]> {
    const log = options?.logger || (() => {});

    log('debug', 'Starting Gmail getNewItems', {
      since: since.toISOString(),
      incrementalOnly: options?.incrementalOnly !== false,
    });

    const gmailConfig = this.validateConfig(config);
    log('debug', 'Gmail config validated', { email: gmailConfig.email });

    const imapConfig = await this.getImapConfig(gmailConfig);
    log('debug', 'IMAP config prepared', {
      host: imapConfig.host,
      port: imapConfig.port,
      username: imapConfig.username,
    });

    let client = null;
    try {
      log('info', 'Connecting to IMAP server...', {
        host: imapConfig.host,
        port: imapConfig.port,
      });
      client = await this.imapConnectionService.connect(imapConfig);
      log('info', 'Connected to IMAP server successfully');

      // Use folders from options, or default Gmail folders
      const folders = options?.filters?.folders || [
        'INBOX',
        '[Gmail]/Sent Mail',
      ];
      const limit = options?.limit || 100; // Default limit of 100

      log('debug', 'Sync configuration', {
        folders,
        limit,
        filters: options?.filters,
      });

      // Build filter with date constraint
      const filter: ImapFilterDto = {
        ...this.convertToImapFilter(options?.filters),
      };

      // Only apply 'since' filter if incrementalOnly is true (default)
      if (options?.incrementalOnly !== false && since.getTime() > 0) {
        filter.dateFrom = since;
        log('debug', 'Applied incremental date filter', {
          dateFrom: since.toISOString(),
        });
      } else {
        log('debug', 'No date filter applied (full sync)');
      }

      const allEmails: ImportItem[] = [];

      for (const folder of folders) {
        if (allEmails.length >= limit) {
          log('debug', `Reached limit of ${limit}, skipping remaining folders`);
          break;
        }

        log('info', `Scanning folder: ${folder}`);

        try {
          const remaining = limit - allEmails.length;
          log('debug', `Browsing folder ${folder}`, {
            remaining,
            filter: {
              ...filter,
              dateFrom: filter.dateFrom?.toISOString(),
            },
          });

          const result = await this.imapConnectionService.browseEmails(
            client,
            folder,
            filter,
            0,
            remaining
          );

          log(
            'info',
            `Folder ${folder}: found ${result.total} matching emails`,
            {
              total: result.total,
              returned: result.emails.length,
              hasMore: result.hasMore,
            }
          );

          for (const email of result.emails) {
            allEmails.push({
              id: `${folder}:${email.uid}`,
              metadata: {
                subject: email.subject,
                from: email.from,
                date: email.date,
              },
            });
          }

          log('debug', `Added ${result.emails.length} emails from ${folder}`, {
            currentTotal: allEmails.length,
          });
        } catch (e: any) {
          log('warn', `Failed to browse folder ${folder}`, {
            error: e.message,
          });
          this.logger.warn(`Failed to browse folder ${folder}: ${e.message}`);
        }
      }

      log('info', `Discovery complete: ${allEmails.length} emails found`, {
        totalEmails: allEmails.length,
        limit,
      });

      this.logger.log(
        `Found ${allEmails.length} emails to sync (limit: ${limit})`
      );
      return allEmails;
    } catch (e: any) {
      log('error', 'Failed during email discovery', { error: e.message });
      throw e;
    } finally {
      if (client) {
        try {
          log('debug', 'Disconnecting from IMAP server...');
          await client.logout();
          log('debug', 'Disconnected from IMAP server');
        } catch {
          // Ignore
        }
      }
    }
  }

  /**
   * Sync emails with batch loop logic
   *
   * This method implements the core batch loop to ensure the requested `limit`
   * of NEW (non-duplicate) emails are imported, not just fetching `limit` emails
   * and skipping duplicates.
   *
   * @param config - Gmail OAuth configuration
   * @param projectId - Project to import into
   * @param integrationId - DataSourceIntegration ID
   * @param since - Timestamp of last sync (ignored if incrementalOnly is false)
   * @param options - Sync options including limit, filters, incrementalOnly
   */
  async sync(
    config: Record<string, any>,
    projectId: string,
    integrationId: string,
    since: Date,
    options?: SyncOptions
  ): Promise<ImportResult> {
    const log: SyncLogger = options?.logger || (() => {});
    const gmailConfig = this.validateConfig(config);
    const imapConfig = await this.getImapConfig(gmailConfig);

    const result: ImportResult = {
      totalImported: 0,
      totalFailed: 0,
      totalSkipped: 0,
      documentIds: [],
      errors: [],
    };

    const limit = options?.limit || 100;
    const batchSize = Math.min(limit, 50); // Fetch in batches of 50 max

    log('info', 'Starting Gmail sync with batch loop', {
      limit,
      batchSize,
      incrementalOnly: options?.incrementalOnly !== false,
      since: since.toISOString(),
    });

    let client = null;
    try {
      client = await this.imapConnectionService.connect(imapConfig);
      log('info', 'Connected to Gmail IMAP server');

      // Get folders to sync
      const folders = options?.filters?.folders || [
        'INBOX',
        '[Gmail]/Sent Mail',
      ];

      // Build filter
      const filter: ImapFilterDto = {
        ...this.convertToImapFilter(options?.filters),
      };

      if (options?.incrementalOnly !== false && since.getTime() > 0) {
        filter.dateFrom = since;
        log('debug', 'Applied incremental date filter', {
          dateFrom: since.toISOString(),
        });
      }

      // Process each folder
      for (const folder of folders) {
        if (result.totalImported >= limit) {
          log('debug', `Reached import limit of ${limit}, stopping`);
          break;
        }

        log('info', `Processing folder: ${folder}`);
        let offset = 0;
        let hasMore = true;

        // Batch loop: keep fetching until we have enough NEW imports or no more emails
        while (hasMore && result.totalImported < limit) {
          const remaining = limit - result.totalImported;
          const fetchCount = Math.min(batchSize, remaining * 2); // Fetch extra to account for duplicates

          log('debug', `Fetching batch from ${folder}`, {
            offset,
            fetchCount,
            remaining,
            currentImported: result.totalImported,
          });

          let browseResult;
          try {
            browseResult = await this.imapConnectionService.browseEmails(
              client,
              folder,
              filter,
              offset,
              fetchCount
            );
          } catch (e: any) {
            log('warn', `Failed to browse folder ${folder}`, {
              error: e.message,
            });
            break;
          }

          if (browseResult.emails.length === 0) {
            log('debug', `No more emails in ${folder}`);
            break;
          }

          log('debug', `Fetched ${browseResult.emails.length} emails`, {
            hasMore: browseResult.hasMore,
          });

          // Get UIDs for this batch
          const uids = browseResult.emails.map((e) => e.uid);

          // Fetch full email content
          const emails = await this.imapConnectionService.fetchEmails(
            client,
            folder,
            uids
          );

          for (const email of emails) {
            if (result.totalImported >= limit) {
              log('debug', 'Reached import limit during batch processing');
              break;
            }

            const itemId = `${folder}:${email.uid}`;

            try {
              // Check for duplicate by Message-ID
              if (email.messageId) {
                const existing = await this.documentRepo
                  .createQueryBuilder('doc')
                  .where('doc.projectId = :projectId', { projectId })
                  .andWhere('doc.sourceType = :sourceType', {
                    sourceType: 'email',
                  })
                  .andWhere("doc.metadata->>'messageId' = :messageId", {
                    messageId: email.messageId,
                  })
                  .getOne();

                if (existing) {
                  log('debug', `Skipping duplicate: ${email.messageId}`);
                  result.totalSkipped++;
                  continue;
                }
              }

              // Create document for the email
              const doc = await this.createEmailDocument(
                email,
                projectId,
                integrationId,
                folder
              );

              result.documentIds.push(doc.id);
              result.totalImported++;

              log('debug', `Imported email ${itemId} as document ${doc.id}`, {
                subject: email.subject,
                totalImported: result.totalImported,
              });

              // Import attachments as child documents
              if (email.hasAttachments && email.bodyStructure) {
                const attachmentParts =
                  this.imapConnectionService.extractAttachmentPartsFromStructure(
                    email.bodyStructure
                  );

                if (attachmentParts.length > 0) {
                  const attResult = await this.importAttachments(
                    client,
                    folder,
                    email,
                    attachmentParts,
                    doc.id,
                    projectId,
                    integrationId
                  );

                  result.documentIds.push(...attResult.documentIds);
                  log(
                    'debug',
                    `Imported ${attResult.imported} attachments for ${doc.id}`
                  );
                }
              }
            } catch (error: any) {
              log('error', `Failed to import email ${itemId}`, {
                error: error.message,
              });
              result.totalFailed++;
              result.errors.push({
                itemId,
                error: error.message,
              });
            }
          }

          // Update offset and check if there are more emails
          offset += browseResult.emails.length;
          hasMore = browseResult.hasMore;

          log('debug', `Batch complete`, {
            offset,
            hasMore,
            totalImported: result.totalImported,
            totalSkipped: result.totalSkipped,
          });
        }
      }

      log('info', 'Sync complete', {
        totalImported: result.totalImported,
        totalSkipped: result.totalSkipped,
        totalFailed: result.totalFailed,
      });

      return result;
    } finally {
      if (client) {
        try {
          await client.logout();
        } catch {
          // Ignore logout errors
        }
      }
    }
  }

  /**
   * Get sync preview with folder stats and match counts
   */
  async getSyncPreview(
    config: Record<string, any>,
    options?: SyncOptions,
    importedCount?: number,
    lastSyncedAt?: Date | null
  ): Promise<SyncPreviewResult> {
    const gmailConfig = this.validateConfig(config);
    const imapConfig = await this.getImapConfig(gmailConfig);

    let client = null;
    try {
      client = await this.imapConnectionService.connect(imapConfig);

      // Use folders from options, or default Gmail folders
      const targetFolders = options?.filters?.folders || [
        'INBOX',
        '[Gmail]/Sent Mail',
      ];

      // Get folder stats
      const folders: FolderStats[] = [];
      let totalEmails = 0;
      let totalUnread = 0;

      for (const folderPath of targetFolders) {
        try {
          const status = await this.imapConnectionService.getFolderStatus(
            client,
            folderPath
          );
          folders.push({
            path: folderPath,
            name: folderPath.split('/').pop() || folderPath,
            totalMessages: status.messageCount,
            unreadMessages: status.unseenCount,
          });
          totalEmails += status.messageCount;
          totalUnread += status.unseenCount;
        } catch (e: any) {
          this.logger.warn(
            `Failed to get status for folder ${folderPath}: ${e.message}`
          );
        }
      }

      // Count matching emails (with filters applied)
      let matchingEmails = 0;
      const filter = this.convertToImapFilter(options?.filters);

      for (const folderPath of targetFolders) {
        try {
          const result = await this.imapConnectionService.browseEmails(
            client,
            folderPath,
            filter,
            0,
            1 // Just need the count, not the actual emails
          );
          matchingEmails += result.total;
        } catch (e: any) {
          this.logger.warn(
            `Failed to count emails in folder ${folderPath}: ${e.message}`
          );
        }
      }

      // Count new emails (since last sync)
      let newEmails = 0;
      if (lastSyncedAt && lastSyncedAt.getTime() > 0) {
        const sinceFilter: ImapFilterDto = {
          ...filter,
          dateFrom: lastSyncedAt,
        };

        for (const folderPath of targetFolders) {
          try {
            const result = await this.imapConnectionService.browseEmails(
              client,
              folderPath,
              sinceFilter,
              0,
              1
            );
            newEmails += result.total;
          } catch (e: any) {
            // Ignore
          }
        }
      } else {
        // No previous sync, all matching emails are "new"
        newEmails = matchingEmails;
      }

      return {
        folders,
        totalEmails,
        totalUnread,
        matchingEmails,
        importedEmails: importedCount || 0,
        newEmails,
        lastSyncedAt: lastSyncedAt || undefined,
        appliedFilters: options?.filters,
      };
    } finally {
      if (client) {
        try {
          await client.logout();
        } catch {
          // Ignore
        }
      }
    }
  }

  // ---------- Helper methods ----------

  /**
   * Validate and convert config to GmailOAuthConfigDto
   */
  private validateConfig(config: Record<string, any>): GmailOAuthConfigDto {
    if (!config.email || !config.accessToken || !config.refreshToken) {
      throw new Error(
        'Invalid Gmail configuration: OAuth authentication required. Please reconnect your Google account.'
      );
    }

    return {
      email: config.email,
      accessToken: config.accessToken,
      refreshToken: config.refreshToken,
      expiresAt: config.expiresAt,
      scope: config.scope,
    };
  }

  /**
   * Get IMAP config with valid access token
   */
  private async getImapConfig(
    gmailConfig: GmailOAuthConfigDto
  ): Promise<ImapConfigDto> {
    // Check if token needs refresh
    const refreshedTokens = await this.googleOAuthService.ensureValidToken({
      accessToken: gmailConfig.accessToken,
      refreshToken: gmailConfig.refreshToken,
      expiresAt: gmailConfig.expiresAt,
    });

    // Use refreshed token if available
    const accessToken = refreshedTokens?.accessToken || gmailConfig.accessToken;

    // Note: If token was refreshed, caller should update stored config
    // This is handled by the service layer

    return {
      host: GMAIL_IMAP_CONFIG.host,
      port: GMAIL_IMAP_CONFIG.port,
      security: GMAIL_IMAP_CONFIG.security as ImapSecurity,
      username: gmailConfig.email,
      password: '', // Not used with OAuth
      accessToken,
    };
  }

  /**
   * Convert browse filters to IMAP filter format
   */
  private convertToImapFilter(
    filters?: Record<string, any>
  ): ImapFilterDto | undefined {
    if (!filters) return undefined;

    const imapFilter: ImapFilterDto = {};

    if (filters.from) imapFilter.from = filters.from;
    if (filters.to) imapFilter.to = filters.to;
    if (filters.subject) imapFilter.subject = filters.subject;
    if (filters.text) imapFilter.text = filters.text;
    if (filters.since) imapFilter.dateFrom = new Date(filters.since);
    if (filters.before) imapFilter.dateTo = new Date(filters.before);
    if (filters.seen !== undefined) imapFilter.seen = filters.seen;
    if (filters.flagged !== undefined) imapFilter.flagged = filters.flagged;

    return imapFilter;
  }

  /**
   * Parse item ID into folder and UID
   */
  private parseItemId(itemId: string): [string, string] {
    const lastColon = itemId.lastIndexOf(':');
    if (lastColon === -1) {
      throw new Error(`Invalid item ID format: ${itemId}`);
    }

    return [itemId.substring(0, lastColon), itemId.substring(lastColon + 1)];
  }

  /**
   * Create a document from an email
   */
  private async createEmailDocument(
    email: any,
    projectId: string,
    integrationId: string,
    folder: string
  ): Promise<Document> {
    const content = this.buildEmailContent(email);

    const metadata: Record<string, any> = {
      messageId: email.messageId,
      folder,
      from: email.from,
      to: email.to,
      cc: email.cc,
      date: email.date,
      subject: email.subject,
      hasAttachments: email.hasAttachments,
      attachmentCount: email.attachmentCount,
      flags: email.flags,
      provider: 'gmail_oauth',
    };

    const doc = this.documentRepo.create({
      projectId,
      sourceType: 'email',
      dataSourceIntegrationId: integrationId,
      filename: email.subject || '(No Subject)',
      content,
      mimeType: 'text/plain',
      metadata,
      conversionStatus: 'not_required',
    });

    const savedDoc = await this.documentRepo.save(doc);

    // Create chunks and queue embedding jobs
    try {
      await this.documentsService.recreateChunks(savedDoc.id);
      this.logger.debug(`Created chunks for email document ${savedDoc.id}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to create chunks for email ${savedDoc.id}: ${error.message}`
      );
    }

    return savedDoc;
  }

  /**
   * Build document content from email
   */
  private buildEmailContent(email: any): string {
    const parts: string[] = [];

    parts.push(`Subject: ${email.subject || '(No Subject)'}`);
    parts.push(
      `From: ${
        email.from
          ?.map((a: any) => (a.name ? `${a.name} <${a.address}>` : a.address))
          .join(', ') || 'Unknown'
      }`
    );
    parts.push(
      `To: ${
        email.to
          ?.map((a: any) => (a.name ? `${a.name} <${a.address}>` : a.address))
          .join(', ') || ''
      }`
    );
    if (email.cc?.length > 0) {
      parts.push(
        `CC: ${email.cc
          .map((a: any) => (a.name ? `${a.name} <${a.address}>` : a.address))
          .join(', ')}`
      );
    }
    parts.push(
      `Date: ${email.date ? new Date(email.date).toISOString() : 'Unknown'}`
    );
    parts.push('');

    if (email.textBody) {
      parts.push(email.textBody);
    } else if (email.htmlBody) {
      parts.push(
        email.htmlBody
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
      );
    }

    return parts.join('\n');
  }

  /**
   * Import email attachments as child documents
   *
   * @param client - Connected IMAP client
   * @param folder - Mailbox folder
   * @param email - Full email DTO with bodyStructure
   * @param attachmentParts - Extracted attachment parts with part numbers
   * @param parentDocumentId - ID of the parent email document
   * @param projectId - Project ID
   * @param integrationId - Data source integration ID
   * @returns Import result with counts and document IDs
   */
  private async importAttachments(
    client: any, // ImapFlow
    folder: string,
    email: ImapEmailFullDto,
    attachmentParts: Array<{
      partNumber: string;
      filename: string;
      contentType: string;
      size: number;
      contentId?: string;
      inline: boolean;
    }>,
    parentDocumentId: string,
    projectId: string,
    integrationId: string
  ): Promise<{ imported: number; failed: number; documentIds: string[] }> {
    const result = { imported: 0, failed: 0, documentIds: [] as string[] };

    // Get orgId from project (needed for storage key)
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      select: ['id', 'organizationId'],
    });

    if (!project) {
      this.logger.error(`Project ${projectId} not found, skipping attachments`);
      return result;
    }

    const orgId = project.organizationId;

    for (const att of attachmentParts) {
      try {
        this.logger.debug(
          `Downloading attachment: ${att.filename} (part ${att.partNumber})`
        );

        // 1. Download attachment content from IMAP
        const { buffer, meta } =
          await this.imapConnectionService.downloadAttachment(
            client,
            folder,
            email.uid,
            att.partNumber
          );

        // 2. Upload to storage
        const uploadResult = await this.storageService.uploadDocument(buffer, {
          orgId,
          projectId,
          filename: att.filename,
          contentType: att.contentType,
        });

        // 3. Determine if conversion/parsing is needed
        const requiresConversion = shouldUseKreuzberg(
          att.contentType,
          att.filename
        );

        // 4. Create Document record as child of the email
        const doc = this.documentRepo.create({
          projectId,
          parentDocumentId,
          sourceType: 'email_attachment',
          dataSourceIntegrationId: integrationId,
          filename: att.filename,
          mimeType: att.contentType,
          storageKey: uploadResult.key,
          storageUrl: uploadResult.storageUrl,
          fileSizeBytes: buffer.length,
          conversionStatus: requiresConversion ? 'pending' : 'not_required',
          metadata: {
            parentMessageId: email.messageId,
            contentId: att.contentId,
            originalSize: att.size,
            provider: 'gmail_oauth',
          },
        });

        const savedDoc = await this.documentRepo.save(doc);
        result.documentIds.push(savedDoc.id);
        result.imported++;

        // 5. Create parsing job if conversion needed (for PDFs, Office docs, etc.)
        if (requiresConversion) {
          await this.parsingJobService.createJob({
            organizationId: orgId,
            projectId,
            sourceType: 'email_attachment',
            sourceFilename: att.filename,
            mimeType: att.contentType,
            fileSizeBytes: buffer.length,
            storageKey: uploadResult.key,
            documentId: savedDoc.id,
            maxRetries: 3,
            metadata: {
              parentDocumentId,
              parentMessageId: email.messageId,
            },
          });

          this.logger.debug(
            `Created parsing job for attachment: ${att.filename}`
          );
        } else {
          // For plain text attachments, read content directly
          const content = buffer.toString('utf-8');
          await this.documentRepo.update(savedDoc.id, {
            content,
            conversionStatus: 'completed',
          });

          // Create chunks for searchability
          try {
            await this.documentsService.recreateChunks(savedDoc.id);
            this.logger.debug(
              `Created chunks for text attachment ${savedDoc.id}`
            );
          } catch (chunkError: any) {
            this.logger.error(
              `Failed to create chunks for attachment ${savedDoc.id}: ${chunkError.message}`
            );
          }
        }

        this.logger.debug(
          `Imported attachment: ${att.filename} as document ${savedDoc.id}`
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to import attachment ${att.filename}: ${error.message}`
        );
        result.failed++;
      }
    }

    return result;
  }
}

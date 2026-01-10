import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ImapFlow } from 'imapflow';
import {
  DataSourceProvider,
  BrowseOptions,
  BrowseResult,
  ImportItem,
  ImportResult,
  TestConnectionResult,
  ProviderMetadata,
  SyncOptions,
  SyncLogger,
} from '../provider.interface';
import { ImapConnectionService } from './imap-connection.service';
import {
  ImapConfigDto,
  ImapFilterDto,
  ImapEmailPreviewDto,
  ImapEmailFullDto,
  IMAP_CONFIG_SCHEMA,
} from './dto';
import { Document } from '../../../../entities/document.entity';
import { Project } from '../../../../entities/project.entity';
import { DocumentsService } from '../../../documents/documents.service';
import { StorageService } from '../../../storage/storage.service';
import { DocumentParsingJobService } from '../../../document-parsing/document-parsing-job.service';
import { shouldUseKreuzberg } from '../../../document-parsing/interfaces';

/**
 * IMAP Email item for browsing (extends base with folder info)
 */
interface ImapBrowseItem extends ImapEmailPreviewDto {
  /** Full item ID in format "folder:uid" */
  itemId: string;
}

/**
 * IMAP Provider
 *
 * Implements the DataSourceProvider interface for IMAP email servers.
 * Allows browsing mailboxes, filtering emails, and importing them as documents.
 */
@Injectable()
export class ImapProvider implements DataSourceProvider {
  private readonly logger = new Logger(ImapProvider.name);

  constructor(
    private readonly connectionService: ImapConnectionService,
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
      providerType: 'imap',
      displayName: 'IMAP Email',
      description:
        'Connect to any IMAP email server to import emails and attachments',
      sourceType: 'email',
      icon: 'lucide--mail',
    };
  }

  /**
   * Get JSON schema for provider configuration
   */
  getConfigSchema(): Record<string, any> {
    return IMAP_CONFIG_SCHEMA;
  }

  /**
   * Test connection with the given configuration
   */
  async testConnection(
    config: Record<string, any>
  ): Promise<TestConnectionResult> {
    const imapConfig = this.validateConfig(config);
    return this.connectionService.testConnection(imapConfig);
  }

  /**
   * Browse available emails in the data source
   */
  async browse(
    config: Record<string, any>,
    options: BrowseOptions
  ): Promise<BrowseResult<ImapBrowseItem>> {
    const imapConfig = this.validateConfig(config);
    let client: ImapFlow | null = null;

    try {
      client = await this.connectionService.connect(imapConfig);

      // Determine folder to browse
      const folder = options.folder || 'INBOX';

      // Convert filters to IMAP filter format
      const imapFilter = this.convertToImapFilter(options.filters);

      // Browse emails
      const result = await this.connectionService.browseEmails(
        client,
        folder,
        imapFilter,
        options.offset || 0,
        options.limit || 50
      );

      // Map to browse items with itemId
      const items: ImapBrowseItem[] = result.emails.map((email) => ({
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
    const imapConfig = this.validateConfig(config);
    let client: ImapFlow | null = null;

    const result: ImportResult = {
      totalImported: 0,
      totalFailed: 0,
      totalSkipped: 0,
      documentIds: [],
      errors: [],
    };

    try {
      client = await this.connectionService.connect(imapConfig);

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

        // Fetch full email content
        const emails = await this.connectionService.fetchEmails(
          client,
          folder,
          uids
        );

        for (const email of emails) {
          const itemId = `${folder}:${email.uid}`;

          try {
            // Check for duplicate by Message-ID stored in metadata
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
                this.logger.debug(
                  `Skipping duplicate email: ${email.messageId}`
                );
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

            // Import attachments as child documents
            if (email.hasAttachments && email.bodyStructure) {
              const attachmentParts =
                this.connectionService.extractAttachmentPartsFromStructure(
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
   * Get new items since last sync
   *
   * Implements batch loop logic to ensure the requested `limit` of NEW (non-duplicate)
   * emails are found, not just fetching `limit` emails and skipping duplicates.
   *
   * @param config - IMAP configuration
   * @param since - Timestamp of last sync (ignored if incrementalOnly is false)
   * @param options - Sync options including limit, filters, incrementalOnly
   */
  async getNewItems(
    config: Record<string, any>,
    since: Date,
    options?: SyncOptions
  ): Promise<ImportItem[]> {
    const log: SyncLogger = options?.logger || (() => {});
    const imapConfig = this.validateConfig(config);
    let client: ImapFlow | null = null;

    log('debug', 'Starting IMAP getNewItems', {
      since: since.toISOString(),
      incrementalOnly: options?.incrementalOnly !== false,
      limit: options?.limit,
    });

    try {
      log('info', 'Connecting to IMAP server...', {
        host: imapConfig.host,
        port: imapConfig.port,
      });
      client = await this.connectionService.connect(imapConfig);
      log('info', 'Connected to IMAP server successfully');

      // Get folders to sync (from options, config, or default to INBOX)
      const folders = options?.filters?.folders ||
        (config.syncFolders as string[]) ||
        (config.folders as string[]) || ['INBOX'];
      const limit = options?.limit || 100;

      log('debug', 'Sync configuration', {
        folders,
        limit,
        filters: options?.filters,
      });

      // Build filter - only apply date constraint if incrementalOnly is true
      const filter: ImapFilterDto = {
        ...this.convertToImapFilter(options?.filters),
      };

      if (options?.incrementalOnly !== false && since.getTime() > 0) {
        filter.dateFrom = since;
        log('debug', 'Applied incremental date filter', {
          dateFrom: since.toISOString(),
        });
      } else {
        log('debug', 'No date filter applied (full sync mode)');
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

          const result = await this.connectionService.browseEmails(
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
                messageId: email.messageId,
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
          // Ignore logout errors
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
   * @param config - IMAP configuration
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
    const imapConfig = this.validateConfig(config);
    let client: ImapFlow | null = null;

    const result: ImportResult = {
      totalImported: 0,
      totalFailed: 0,
      totalSkipped: 0,
      documentIds: [],
      errors: [],
    };

    const limit = options?.limit || 100;
    const batchSize = Math.min(limit, 50); // Fetch in batches of 50 max

    log('info', 'Starting IMAP sync with batch loop', {
      limit,
      batchSize,
      incrementalOnly: options?.incrementalOnly !== false,
      since: since.toISOString(),
    });

    try {
      client = await this.connectionService.connect(imapConfig);
      log('info', 'Connected to IMAP server');

      // Get folders to sync
      const folders = options?.filters?.folders ||
        (config.syncFolders as string[]) ||
        (config.folders as string[]) || ['INBOX'];

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

          const browseResult = await this.connectionService.browseEmails(
            client,
            folder,
            filter,
            offset,
            fetchCount
          );

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
          const emails = await this.connectionService.fetchEmails(
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
                  this.connectionService.extractAttachmentPartsFromStructure(
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

  // ---------- Helper methods ----------

  /**
   * Validate and convert config to ImapConfigDto
   */
  private validateConfig(config: Record<string, any>): ImapConfigDto {
    // Basic validation - in production, use class-validator
    if (!config.host || !config.port || !config.username || !config.password) {
      throw new Error(
        'Invalid IMAP configuration: host, port, username, and password are required'
      );
    }

    return {
      host: config.host,
      port: config.port,
      security: config.security || 'tls',
      authMethod: config.authMethod,
      username: config.username,
      password: config.password,
      accessToken: config.accessToken,
      refreshToken: config.refreshToken,
      connectionTimeout: config.connectionTimeout,
      tlsVerify: config.tlsVerify,
    };
  }

  /**
   * Convert browse filters to IMAP filter format
   */
  private convertToImapFilter(
    filters?: Record<string, any>
  ): ImapFilterDto | undefined {
    if (!filters) {
      return undefined;
    }

    const imapFilter: ImapFilterDto = {};

    if (filters.from) imapFilter.from = filters.from;
    if (filters.to) imapFilter.to = filters.to;
    if (filters.subject) imapFilter.subject = filters.subject;
    if (filters.text) imapFilter.text = filters.text;
    if (filters.since) imapFilter.dateFrom = new Date(filters.since);
    if (filters.before) imapFilter.dateTo = new Date(filters.before);
    if (filters.seen !== undefined) imapFilter.seen = filters.seen;
    if (filters.flagged !== undefined) imapFilter.flagged = filters.flagged;
    if (filters.hasAttachments !== undefined)
      imapFilter.hasAttachments = filters.hasAttachments;

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

    const folder = itemId.substring(0, lastColon);
    const uid = itemId.substring(lastColon + 1);

    return [folder, uid];
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
    // Build document content
    const content = this.buildEmailContent(email);

    // Build metadata including email-specific fields
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
      references: email.references,
      inReplyTo: email.inReplyTo,
    };

    // Create document using the correct entity fields
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

    // Headers
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
    if (email.cc && email.cc.length > 0) {
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

    // Body - prefer text over HTML
    if (email.textBody) {
      parts.push(email.textBody);
    } else if (email.htmlBody) {
      // Basic HTML stripping - in production use a proper HTML-to-text converter
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
    client: ImapFlow,
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
          await this.connectionService.downloadAttachment(
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

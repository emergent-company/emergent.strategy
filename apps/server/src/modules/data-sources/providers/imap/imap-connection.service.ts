import { Injectable, Logger } from '@nestjs/common';
import { ImapFlow, FetchMessageObject, ImapFlowOptions } from 'imapflow';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mailparser = require('mailparser');
const { simpleParser } = mailparser;
import {
  ImapConfigDto,
  ImapSecurity,
  ImapFolderDto,
  ImapEmailPreviewDto,
  ImapEmailFullDto,
  EmailAddressDto,
  EmailAttachmentPreviewDto,
  ImapFilterDto,
  DateFilterType,
  SizeFilterType,
} from './dto';

/**
 * Parsed mail interface (from mailparser)
 */
interface ParsedMail {
  messageId?: string;
  text?: string;
  html?: string | false;
  attachments?: Array<{
    filename?: string;
    contentType: string;
    size: number;
    contentId?: string;
    contentDisposition?: string;
  }>;
  /** Can be a string (single reference) or array of strings (multiple references) */
  references?: string | string[];
  inReplyTo?: string;
}

/**
 * IMAP Connection Service
 *
 * Low-level service for connecting to IMAP servers and performing operations.
 * Uses imapflow for IMAP protocol handling and mailparser for email parsing.
 */
@Injectable()
export class ImapConnectionService {
  private readonly logger = new Logger(ImapConnectionService.name);

  /**
   * Create an ImapFlow client configuration from our config DTO
   */
  private createClientConfig(config: ImapConfigDto): ImapFlowOptions {
    const clientConfig: ImapFlowOptions = {
      host: config.host,
      port: config.port,
      secure: config.security === ImapSecurity.TLS,
      auth: {
        user: config.username,
        pass: config.password,
      },
      logger: false, // We handle logging ourselves
      // Add socket timeout to prevent long hangs (30 seconds)
      socketTimeout: 30000,
    };

    // Connection timeout (default 30 seconds)
    clientConfig.connectionTimeout = config.connectionTimeout || 30000;

    // TLS options
    if (config.security !== ImapSecurity.NONE) {
      clientConfig.tls = {
        rejectUnauthorized: config.tlsVerify !== false,
      };
    }

    // STARTTLS upgrade
    if (config.security === ImapSecurity.STARTTLS) {
      clientConfig.secure = false;
      (clientConfig as any).requireTLS = true;
    }

    // OAuth2 authentication
    if (config.accessToken) {
      clientConfig.auth = {
        user: config.username,
        accessToken: config.accessToken,
      };
    }

    return clientConfig;
  }

  /**
   * Create a new IMAP client connection
   */
  async connect(config: ImapConfigDto): Promise<ImapFlow> {
    const clientConfig = this.createClientConfig(config);
    const client = new ImapFlow(clientConfig);

    // Attach error handler to prevent unhandled 'error' events from crashing the process
    client.on('error', (err) => {
      this.logger.error(
        `IMAP connection error to ${config.host}: ${err.message}`,
        err.stack
      );
    });

    this.logger.debug(`Connecting to ${config.host}:${config.port}`);

    await client.connect();
    this.logger.debug(`Connected to ${config.host}`);

    return client;
  }

  /**
   * Test connection to IMAP server
   */
  async testConnection(
    config: ImapConfigDto
  ): Promise<{ success: boolean; error?: string; info?: Record<string, any> }> {
    let client: ImapFlow | null = null;

    try {
      client = await this.connect(config);

      // Get server capabilities and info
      const info: Record<string, any> = {
        serverGreeting: 'Connected',
        authenticated: true,
      };

      // Try to list folders to verify full access
      const folders = await this.listFolders(client);
      info.folderCount = folders.length;

      // Try to get INBOX status
      const inbox = await client.status('INBOX', {
        messages: true,
        unseen: true,
      });
      info.inboxMessages = inbox.messages;
      info.inboxUnseen = inbox.unseen;

      return { success: true, info };
    } catch (error: any) {
      this.logger.warn(`Connection test failed: ${error.message}`);

      // Parse common IMAP errors
      let errorMessage = error.message || 'Unknown error';
      if (error.code === 'ECONNREFUSED') {
        errorMessage = `Connection refused to ${config.host}:${config.port}`;
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = `Server not found: ${config.host}`;
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = `Connection timed out to ${config.host}:${config.port}`;
      } else if (
        error.message?.includes('AUTHENTICATIONFAILED') ||
        error.message?.includes('Invalid credentials')
      ) {
        errorMessage = 'Authentication failed. Check username and password.';
      } else if (error.message?.includes('certificate')) {
        errorMessage =
          'TLS certificate verification failed. Check server certificate or disable verification.';
      }

      return { success: false, error: errorMessage };
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
   * List all folders/mailboxes
   */
  async listFolders(client: ImapFlow): Promise<ImapFolderDto[]> {
    const folders: ImapFolderDto[] = [];
    const mailboxList = await client.list();

    for (const mailbox of mailboxList) {
      folders.push(this.mapMailboxToFolder(mailbox));
    }

    return folders;
  }

  /**
   * Get folder hierarchy (builds parent-child relationships)
   */
  async getFolderHierarchy(client: ImapFlow): Promise<ImapFolderDto[]> {
    const flatFolders = await this.listFolders(client);
    return this.buildFolderTree(flatFolders);
  }

  /**
   * Get folder status (message counts)
   */
  async getFolderStatus(
    client: ImapFlow,
    folderPath: string
  ): Promise<{ messageCount: number; unseenCount: number }> {
    const status = await client.status(folderPath, {
      messages: true,
      unseen: true,
    });

    return {
      messageCount: status.messages || 0,
      unseenCount: status.unseen || 0,
    };
  }

  /**
   * Browse emails in a folder with optional filtering
   */
  async browseEmails(
    client: ImapFlow,
    folder: string,
    filter?: ImapFilterDto,
    offset = 0,
    limit = 50
  ): Promise<{
    emails: ImapEmailPreviewDto[];
    total: number;
    hasMore: boolean;
  }> {
    // Open the mailbox
    const mailbox = await client.mailboxOpen(folder);
    const total = mailbox.exists || 0;

    if (total === 0) {
      return { emails: [], total: 0, hasMore: false };
    }

    // Build search criteria
    const searchCriteria = this.buildSearchCriteria(filter);

    // Search for matching UIDs
    let uids: number[];
    if (searchCriteria.length > 0) {
      // Combine criteria with AND
      const combinedCriteria =
        searchCriteria.length === 1
          ? searchCriteria[0]
          : Object.assign({}, ...searchCriteria);
      const searchResult = await client.search(combinedCriteria, { uid: true });
      this.logger.debug(
        `Search result type: ${typeof searchResult}, isArray: ${Array.isArray(
          searchResult
        )}, value: ${JSON.stringify(searchResult)?.slice(0, 200)}`
      );
      uids = this.normalizeSearchResult(searchResult);
    } else {
      // Get all UIDs
      const searchResult = await client.search({ all: true }, { uid: true });
      this.logger.debug(
        `Search result (all) type: ${typeof searchResult}, isArray: ${Array.isArray(
          searchResult
        )}, value: ${JSON.stringify(searchResult)?.slice(0, 200)}`
      );
      uids = this.normalizeSearchResult(searchResult);
    }

    this.logger.debug(
      `After normalization: uids.length=${
        uids.length
      }, first 5: ${JSON.stringify(uids.slice(0, 5))}`
    );

    const totalMatching = uids.length;

    // Sort UIDs descending (newest first) and apply pagination
    uids.sort((a, b) => b - a);
    const paginatedUids = uids.slice(offset, offset + limit);

    // IMAP commands typically expect UIDs in ascending order.
    // While imapflow might handle it, some servers are strict.
    const fetchUids = [...paginatedUids].sort((a, b) => a - b);

    this.logger.debug(
      `Pagination: offset=${offset}, limit=${limit}, totalMatching=${totalMatching}, paginatedUids.length=${
        paginatedUids.length
      }, first 5 (desc): ${JSON.stringify(
        paginatedUids.slice(0, 5)
      )}, fetchUids.length=${fetchUids.length}`
    );

    if (fetchUids.length === 0) {
      return { emails: [], total: totalMatching, hasMore: false };
    }

    // Fetch the emails
    const emails: ImapEmailPreviewDto[] = [];

    this.logger.debug(
      `Fetching ${fetchUids.length} emails using UIDs: ${JSON.stringify(
        fetchUids
      )}`
    );
    try {
      const fetchIterator = client.fetch(
        fetchUids,
        {
          uid: true,
          envelope: true,
          flags: true,
          bodyStructure: true,
          size: true,
          internalDate: true,
        },
        { uid: true } // Options: use UIDs instead of sequence numbers
      );

      for await (const message of fetchIterator) {
        this.logger.debug(`Fetched message UID: ${message.uid}`);
        emails.push(this.mapMessageToPreview(message, folder));
      }
    } catch (fetchError: any) {
      this.logger.error(
        `Error fetching emails: ${fetchError.message}`,
        fetchError.stack
      );
    }

    this.logger.debug(`Fetched ${emails.length} emails total`);

    return {
      emails,
      total: totalMatching,
      hasMore: offset + limit < totalMatching,
    };
  }

  /**
   * Normalize search result to number array
   */
  private normalizeSearchResult(result: number[] | number | false): number[] {
    if (result === false) {
      return [];
    }
    if (Array.isArray(result)) {
      return result.filter((v): v is number => typeof v === 'number');
    }
    return typeof result === 'number' ? [result] : [];
  }

  /**
   * Fetch full email content by UID
   */
  async fetchEmail(
    client: ImapFlow,
    folder: string,
    uid: number
  ): Promise<ImapEmailFullDto | null> {
    await client.mailboxOpen(folder);

    // Fetch the full message source
    const message = await client.fetchOne(
      uid,
      {
        uid: true,
        envelope: true,
        flags: true,
        bodyStructure: true,
        size: true,
        internalDate: true,
        source: true,
      },
      { uid: true } // Options: use UID instead of sequence number
    );

    if (!message || !message.source) {
      return null;
    }

    // Parse the email
    const parsed: ParsedMail = await simpleParser(message.source);

    return this.mapParsedEmailToFull(message, parsed, folder);
  }

  /**
   * Fetch multiple emails by UIDs
   */
  async fetchEmails(
    client: ImapFlow,
    folder: string,
    uids: number[]
  ): Promise<ImapEmailFullDto[]> {
    if (uids.length === 0) {
      return [];
    }

    await client.mailboxOpen(folder);

    const emails: ImapEmailFullDto[] = [];
    // Sort UIDs ascending for IMAP compatibility
    const fetchUids = [...uids].sort((a, b) => a - b);
    this.logger.debug(
      `Fetching ${fetchUids.length} full emails from ${folder}`
    );

    for await (const message of client.fetch(
      fetchUids,
      {
        uid: true,
        envelope: true,
        flags: true,
        bodyStructure: true,
        size: true,
        internalDate: true,
        source: true,
      },
      { uid: true } // Options: use UIDs instead of sequence numbers
    )) {
      if (message.source) {
        const parsed: ParsedMail = await simpleParser(message.source);
        emails.push(this.mapParsedEmailToFull(message, parsed, folder));
      }
    }

    return emails;
  }

  /**
   * Get emails since a specific date (for incremental sync)
   */
  async getEmailsSince(
    client: ImapFlow,
    folders: string[],
    since: Date
  ): Promise<Array<{ folder: string; uid: number }>> {
    const results: Array<{ folder: string; uid: number }> = [];

    for (const folder of folders) {
      try {
        await client.mailboxOpen(folder);

        const searchResult = await client.search(
          { since: since },
          { uid: true }
        );
        const uids = this.normalizeSearchResult(searchResult);

        for (const uid of uids) {
          if (typeof uid === 'number') {
            results.push({ folder, uid });
          }
        }
      } catch (error: any) {
        this.logger.warn(`Error searching folder ${folder}: ${error.message}`);
      }
    }

    return results;
  }

  // ---------- Private helpers ----------

  /**
   * Map ImapFlow mailbox to our DTO
   */
  private mapMailboxToFolder(mailbox: any): ImapFolderDto {
    return {
      path: mailbox.path,
      name: mailbox.name || mailbox.path.split(mailbox.delimiter || '/').pop(),
      delimiter: mailbox.delimiter,
      parent: mailbox.parent?.path || null,
      selectable: !mailbox.flags?.has('\\Noselect'),
      hasChildren: mailbox.flags?.has('\\HasChildren') || false,
      specialUse: this.getSpecialUse(mailbox),
      flags: mailbox.flags ? Array.from(mailbox.flags) : [],
    };
  }

  /**
   * Get special use attribute from mailbox
   */
  private getSpecialUse(mailbox: any): string | undefined {
    const specialFlags = [
      '\\Inbox',
      '\\Sent',
      '\\Drafts',
      '\\Trash',
      '\\Junk',
      '\\Archive',
      '\\All',
      '\\Flagged',
    ];

    if (mailbox.specialUse) {
      return mailbox.specialUse;
    }

    if (mailbox.flags) {
      for (const flag of specialFlags) {
        if (mailbox.flags.has(flag)) {
          return flag;
        }
      }
    }

    // Common folder name detection
    const name = mailbox.path.toLowerCase();
    if (name === 'inbox') return '\\Inbox';
    if (name.includes('sent')) return '\\Sent';
    if (name.includes('draft')) return '\\Drafts';
    if (name.includes('trash') || name.includes('deleted')) return '\\Trash';
    if (name.includes('junk') || name.includes('spam')) return '\\Junk';
    if (name.includes('archive')) return '\\Archive';

    return undefined;
  }

  /**
   * Build folder tree from flat list
   */
  private buildFolderTree(folders: ImapFolderDto[]): ImapFolderDto[] {
    const folderMap = new Map<string, ImapFolderDto>();
    const roots: ImapFolderDto[] = [];

    // Index all folders
    for (const folder of folders) {
      folder.children = [];
      folderMap.set(folder.path, folder);
    }

    // Build tree
    for (const folder of folders) {
      if (folder.parent && folderMap.has(folder.parent)) {
        const parent = folderMap.get(folder.parent)!;
        parent.children!.push(folder);
      } else {
        roots.push(folder);
      }
    }

    return roots;
  }

  /**
   * Build IMAP search criteria from filter DTO
   */
  private buildSearchCriteria(filter?: ImapFilterDto): any[] {
    const criteria: any[] = [];

    if (!filter) {
      return criteria;
    }

    if (filter.from) {
      criteria.push({ from: filter.from });
    }

    if (filter.to) {
      criteria.push({ to: filter.to });
    }

    if (filter.subject) {
      criteria.push({ subject: filter.subject });
    }

    if (filter.body) {
      criteria.push({ body: filter.body });
    }

    if (filter.text) {
      criteria.push({ text: filter.text });
    }

    // Date filters - handle explicit dateFrom/dateTo even if dateType is missing
    if (filter.dateFrom && !filter.dateType) {
      criteria.push({ since: filter.dateFrom });
    }
    if (filter.dateTo && !filter.dateType) {
      criteria.push({ before: filter.dateTo });
    }

    if (filter.dateType && filter.date) {
      switch (filter.dateType) {
        case DateFilterType.BEFORE:
          criteria.push({ before: filter.date });
          break;
        case DateFilterType.AFTER:
          criteria.push({ since: filter.date });
          break;
        case DateFilterType.ON:
          criteria.push({ on: filter.date });
          break;
        case DateFilterType.BETWEEN:
          if (filter.dateFrom) {
            criteria.push({ since: filter.dateFrom });
          }
          if (filter.dateTo) {
            criteria.push({ before: filter.dateTo });
          }
          break;
      }
    }

    // Size filters
    if (filter.sizeType && filter.sizeBytes) {
      switch (filter.sizeType) {
        case SizeFilterType.LARGER:
          criteria.push({ larger: filter.sizeBytes });
          break;
        case SizeFilterType.SMALLER:
          criteria.push({ smaller: filter.sizeBytes });
          break;
      }
    }

    // Flag filters
    if (filter.seen !== undefined) {
      criteria.push(filter.seen ? { seen: true } : { unseen: true });
    }

    if (filter.flagged !== undefined) {
      criteria.push(filter.flagged ? { flagged: true } : { unflagged: true });
    }

    if (filter.answered !== undefined) {
      criteria.push(
        filter.answered ? { answered: true } : { unanswered: true }
      );
    }

    // Specific UIDs
    if (filter.uids && filter.uids.length > 0) {
      criteria.push({ uid: filter.uids.join(',') });
    }

    return criteria;
  }

  /**
   * Map FetchMessageObject to email preview DTO
   */
  private mapMessageToPreview(
    message: FetchMessageObject,
    folder: string
  ): ImapEmailPreviewDto {
    const envelope = message.envelope;
    const flags = message.flags ? Array.from(message.flags) : [];

    // Parse attachments from body structure
    const attachments = this.extractAttachmentPreviews(message.bodyStructure);

    // Handle date conversion
    let emailDate: Date;
    if (envelope?.date) {
      emailDate =
        typeof envelope.date === 'string'
          ? new Date(envelope.date)
          : envelope.date;
    } else {
      emailDate = new Date();
    }

    return {
      uid: message.uid,
      seqNo: message.seq,
      messageId: envelope?.messageId,
      subject: envelope?.subject || '(No Subject)',
      from: this.mapAddresses(envelope?.from),
      to: this.mapAddresses(envelope?.to),
      cc: this.mapAddresses(envelope?.cc),
      date: emailDate,
      receivedDate:
        message.internalDate instanceof Date
          ? message.internalDate
          : message.internalDate
          ? new Date(message.internalDate)
          : undefined,
      folder,
      flags,
      seen: flags.includes('\\Seen'),
      flagged: flags.includes('\\Flagged'),
      size: message.size,
      hasAttachments: attachments.length > 0,
      attachmentCount: attachments.length,
      attachments,
      inReplyTo: envelope?.inReplyTo,
    };
  }

  /**
   * Map parsed email to full DTO
   */
  private mapParsedEmailToFull(
    message: FetchMessageObject,
    parsed: ParsedMail,
    folder: string
  ): ImapEmailFullDto {
    const preview = this.mapMessageToPreview(message, folder);

    // Extract attachment info from parsed email
    const attachments: EmailAttachmentPreviewDto[] = [];
    if (parsed.attachments) {
      for (const att of parsed.attachments) {
        attachments.push({
          filename: att.filename || 'attachment',
          contentType: att.contentType,
          size: att.size,
          contentId: att.contentId,
          inline: att.contentDisposition === 'inline',
        });
      }
    }

    return {
      ...preview,
      messageId: parsed.messageId || preview.messageId,
      textBody: parsed.text,
      htmlBody: parsed.html || undefined,
      attachments,
      hasAttachments: attachments.length > 0,
      attachmentCount: attachments.length,
      references: Array.isArray(parsed.references)
        ? parsed.references.join(' ')
        : parsed.references,
      inReplyTo: parsed.inReplyTo,
      bodyStructure: message.bodyStructure, // Include for attachment downloading
    };
  }

  /**
   * Map address array to DTO
   */
  private mapAddresses(
    addresses?: Array<{ name?: string; address?: string }>
  ): EmailAddressDto[] {
    if (!addresses) {
      return [];
    }

    return addresses
      .filter((a) => a.address)
      .map((a) => ({
        name: a.name,
        address: a.address!,
      }));
  }

  /**
   * Extract attachment previews from body structure
   */
  private extractAttachmentPreviews(
    bodyStructure: any
  ): EmailAttachmentPreviewDto[] {
    const attachments: EmailAttachmentPreviewDto[] = [];

    if (!bodyStructure) {
      return attachments;
    }

    const processStructure = (part: any) => {
      if (!part) return;

      // Check if this part is an attachment
      const disposition = part.disposition;
      const isAttachment =
        disposition === 'attachment' ||
        (disposition === 'inline' && part.id) ||
        (part.type && !['text', 'multipart'].includes(part.type.toLowerCase()));

      if (isAttachment && part.size) {
        attachments.push({
          filename:
            part.dispositionParameters?.filename ||
            part.parameters?.name ||
            'attachment',
          contentType: part.type
            ? `${part.type}/${part.subtype || 'octet-stream'}`
            : 'application/octet-stream',
          size: part.size,
          contentId: part.id,
          inline: disposition === 'inline',
        });
      }

      // Process child parts
      if (part.childNodes) {
        for (const child of part.childNodes) {
          processStructure(child);
        }
      }
    };

    processStructure(bodyStructure);
    return attachments;
  }

  /**
   * Extract attachment parts with MIME part numbers from body structure.
   * Used for downloading attachments individually.
   * Filters out inline attachments (email signatures, embedded images).
   *
   * @param bodyStructure - MIME body structure from IMAP fetch
   * @returns Array of attachment info with part numbers for downloading
   */
  extractAttachmentPartsFromStructure(bodyStructure: any): Array<{
    partNumber: string;
    filename: string;
    contentType: string;
    size: number;
    contentId?: string;
    inline: boolean;
  }> {
    const attachments: Array<{
      partNumber: string;
      filename: string;
      contentType: string;
      size: number;
      contentId?: string;
      inline: boolean;
    }> = [];

    if (!bodyStructure) {
      return attachments;
    }

    const processStructure = (part: any) => {
      if (!part) return;

      const disposition = part.disposition;
      // Only include explicit attachments, skip inline (signatures, embedded images)
      const isRealAttachment = disposition === 'attachment';

      if (isRealAttachment && part.part && part.size) {
        attachments.push({
          partNumber: part.part,
          filename:
            part.dispositionParameters?.filename ||
            part.parameters?.name ||
            'attachment',
          contentType: part.type
            ? `${part.type}/${part.subtype || 'octet-stream'}`
            : 'application/octet-stream',
          size: part.size,
          contentId: part.id,
          inline: false,
        });
      }

      // Recurse into child nodes
      if (part.childNodes) {
        for (const child of part.childNodes) {
          processStructure(child);
        }
      }
    };

    processStructure(bodyStructure);
    return attachments;
  }

  /**
   * Download a specific attachment from an email by MIME part number.
   *
   * @param client - Connected ImapFlow client
   * @param folder - Mailbox folder name
   * @param uid - Email UID
   * @param partNumber - MIME part number (e.g., '2', '1.2')
   * @returns Attachment buffer and metadata
   */
  async downloadAttachment(
    client: ImapFlow,
    folder: string,
    uid: number,
    partNumber: string
  ): Promise<{
    buffer: Buffer;
    meta: {
      filename?: string;
      contentType?: string;
      size?: number;
    };
  }> {
    await client.mailboxOpen(folder);

    this.logger.debug(
      `Downloading attachment part ${partNumber} from UID ${uid} in ${folder}`
    );

    const { meta, content } = await client.download(
      uid.toString(),
      partNumber,
      {
        uid: true,
      }
    );

    // Convert Readable stream to Buffer
    const chunks: Buffer[] = [];
    for await (const chunk of content) {
      chunks.push(Buffer.from(chunk));
    }

    const buffer = Buffer.concat(chunks);

    this.logger.debug(
      `Downloaded attachment: ${meta.filename || 'unknown'} (${
        buffer.length
      } bytes)`
    );

    return {
      buffer,
      meta: {
        filename: meta.filename,
        contentType: meta.contentType,
        size: meta.expectedSize,
      },
    };
  }
}

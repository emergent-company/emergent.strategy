import { Injectable, Logger } from '@nestjs/common';

// Use require for CommonJS modules without proper TypeScript types
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mailparser = require('mailparser');
const { simpleParser } = mailparser;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const MsgReader = require('@kenjiuno/msgreader').default;

/**
 * Email address structure
 */
export interface EmailAddress {
  name?: string;
  address: string;
}

/**
 * Email attachment structure
 */
export interface ParsedEmailAttachment {
  filename: string;
  contentType: string;
  size: number;
  content: Buffer;
  contentId?: string;
  inline?: boolean;
}

/**
 * Parsed email file result
 */
export interface ParsedEmailFile {
  messageId?: string;
  subject?: string;
  from?: EmailAddress[];
  to?: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  date?: Date;
  inReplyTo?: string;
  references?: string[];
  textBody?: string;
  htmlBody?: string;
  attachments?: ParsedEmailAttachment[];
}

/**
 * Email File Parser Service
 *
 * Parses .eml (RFC 822) and .msg (Outlook) email files to extract
 * full email content, metadata, and attachments.
 *
 * Uses:
 * - mailparser: For .eml files (standard RFC 822 format)
 * - @kenjiuno/msgreader: For .msg files (Microsoft Outlook format)
 *
 * This enables proper handling of uploaded email files with the same
 * fidelity as the IMAP/Gmail integrations, extracting:
 * - Full metadata (subject, from, to, cc, bcc, date, messageId)
 * - Email threading info (inReplyTo, references)
 * - Plain text and HTML body content
 * - Attachments with binary content for creating child documents
 */
@Injectable()
export class EmailFileParserService {
  private readonly logger = new Logger(EmailFileParserService.name);

  /**
   * Parse an email file based on MIME type or filename extension
   */
  async parseEmailFile(
    buffer: Buffer,
    mimeType: string | null | undefined,
    filename: string | null | undefined
  ): Promise<ParsedEmailFile> {
    const isMsg = this.isMsgFile(mimeType, filename);

    if (isMsg) {
      return this.parseMsgFile(buffer);
    } else {
      return this.parseEmlFile(buffer);
    }
  }

  /**
   * Parse a .eml file (RFC 822 format) using mailparser
   */
  async parseEmlFile(buffer: Buffer): Promise<ParsedEmailFile> {
    this.logger.debug('Parsing .eml file');

    try {
      const parsed = await simpleParser(buffer);

      const result: ParsedEmailFile = {
        messageId: parsed.messageId || undefined,
        subject: parsed.subject || undefined,
        from: this.normalizeAddresses(parsed.from),
        to: this.normalizeAddresses(parsed.to),
        cc: this.normalizeAddresses(parsed.cc),
        bcc: this.normalizeAddresses(parsed.bcc),
        date: parsed.date || undefined,
        inReplyTo: parsed.inReplyTo || undefined,
        references: this.normalizeReferences(parsed.references),
        textBody: parsed.text || undefined,
        htmlBody: typeof parsed.html === 'string' ? parsed.html : undefined,
        attachments: this.normalizeMailparserAttachments(parsed.attachments),
      };

      this.logger.debug(
        `Parsed .eml: subject="${result.subject}", attachments=${
          result.attachments?.length ?? 0
        }`
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to parse .eml file: ${(error as Error).message}`
      );
      throw new Error(
        `Failed to parse email file: ${(error as Error).message}`
      );
    }
  }

  /**
   * Parse a .msg file (Outlook format) using msgreader
   */
  async parseMsgFile(buffer: Buffer): Promise<ParsedEmailFile> {
    this.logger.debug('Parsing .msg file');

    try {
      const reader = new MsgReader(buffer);
      const fileData = reader.getFileData();

      const result: ParsedEmailFile = {
        messageId: fileData.messageId || undefined,
        subject: fileData.subject || undefined,
        from: this.parseMsgSender(fileData),
        to: this.parseMsgRecipients(fileData, 'to'),
        cc: this.parseMsgRecipients(fileData, 'cc'),
        bcc: this.parseMsgRecipients(fileData, 'bcc'),
        date: this.parseMsgDate(fileData),
        inReplyTo: fileData.inReplyTo || undefined,
        references: fileData.references
          ? [fileData.references].flat()
          : undefined,
        textBody: fileData.body || undefined,
        htmlBody: fileData.bodyHTML || undefined,
        attachments: this.parseMsgAttachments(reader, fileData),
      };

      this.logger.debug(
        `Parsed .msg: subject="${result.subject}", attachments=${
          result.attachments?.length ?? 0
        }`
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to parse .msg file: ${(error as Error).message}`
      );
      throw new Error(
        `Failed to parse Outlook message file: ${(error as Error).message}`
      );
    }
  }

  /**
   * Check if a file is a .msg (Outlook) format
   */
  private isMsgFile(
    mimeType: string | null | undefined,
    filename: string | null | undefined
  ): boolean {
    // Check MIME type
    if (mimeType === 'application/vnd.ms-outlook') {
      return true;
    }

    // Check file extension
    if (filename) {
      const ext = filename.toLowerCase().split('.').pop();
      return ext === 'msg';
    }

    return false;
  }

  /**
   * Normalize mailparser address objects to our format
   */
  private normalizeAddresses(addresses: any): EmailAddress[] | undefined {
    if (!addresses) return undefined;

    // mailparser can return AddressObject with .value array
    const addressList = addresses.value || addresses;

    if (!Array.isArray(addressList)) {
      // Single address object
      if (addressList.address) {
        return [
          {
            name: addressList.name || undefined,
            address: addressList.address,
          },
        ];
      }
      return undefined;
    }

    return addressList
      .filter((a: any) => a.address)
      .map((a: any) => ({
        name: a.name || undefined,
        address: a.address,
      }));
  }

  /**
   * Normalize references to string array
   */
  private normalizeReferences(references: any): string[] | undefined {
    if (!references) return undefined;

    if (typeof references === 'string') {
      return [references];
    }

    if (Array.isArray(references)) {
      return references.filter((r) => typeof r === 'string');
    }

    return undefined;
  }

  /**
   * Normalize mailparser attachments to our format
   */
  private normalizeMailparserAttachments(
    attachments: any[]
  ): ParsedEmailAttachment[] | undefined {
    if (!attachments || attachments.length === 0) return undefined;

    return attachments.map((att) => ({
      filename: att.filename || 'attachment',
      contentType: att.contentType || 'application/octet-stream',
      size: att.size || att.content?.length || 0,
      content: att.content,
      contentId: att.contentId || undefined,
      inline: att.contentDisposition === 'inline',
    }));
  }

  /**
   * Parse sender from .msg file data
   */
  private parseMsgSender(fileData: any): EmailAddress[] | undefined {
    if (fileData.senderEmail) {
      return [
        {
          name: fileData.senderName || undefined,
          address: fileData.senderEmail,
        },
      ];
    }

    // Fallback to headers if available
    if (fileData.headers?.from) {
      return [{ address: fileData.headers.from }];
    }

    return undefined;
  }

  /**
   * Parse recipients from .msg file data
   */
  private parseMsgRecipients(
    fileData: any,
    type: 'to' | 'cc' | 'bcc'
  ): EmailAddress[] | undefined {
    // MsgReader stores recipients in a recipients array
    const recipients = fileData.recipients;

    if (!recipients || !Array.isArray(recipients)) {
      return undefined;
    }

    // Filter by recipient type
    // Type: 1 = To, 2 = CC, 3 = BCC
    const typeMap = { to: 1, cc: 2, bcc: 3 };
    const targetType = typeMap[type];

    const filtered = recipients.filter(
      (r: any) => r.recipType === targetType || r.type === type
    );

    if (filtered.length === 0) {
      return undefined;
    }

    return filtered
      .map((r: any) => ({
        name: r.name || undefined,
        address: r.email || r.smtpAddress || r.address || '',
      }))
      .filter((r: EmailAddress) => r.address);
  }

  /**
   * Parse date from .msg file data
   */
  private parseMsgDate(fileData: any): Date | undefined {
    // Try different date properties
    const dateStr =
      fileData.messageDeliveryTime ||
      fileData.clientSubmitTime ||
      fileData.creationTime ||
      fileData.lastModificationTime;

    if (dateStr) {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }

    return undefined;
  }

  /**
   * Parse attachments from .msg file
   */
  private parseMsgAttachments(
    reader: any,
    fileData: any
  ): ParsedEmailAttachment[] | undefined {
    const attachments = fileData.attachments;

    if (!attachments || attachments.length === 0) {
      return undefined;
    }

    return attachments
      .map((att: any, index: number) => {
        try {
          // Get attachment content using the reader
          const content = reader.getAttachment(index);

          if (!content) {
            this.logger.warn(
              `Could not extract content for attachment ${index}: ${att.fileName}`
            );
            return null;
          }

          return {
            filename: att.fileName || att.name || `attachment_${index}`,
            contentType:
              att.mimeType || att.contentType || 'application/octet-stream',
            size: att.contentLength || content.length || 0,
            content: Buffer.from(content),
            contentId: att.contentId || undefined,
            inline: att.attachMethod === 6, // OLE attachment (inline)
          };
        } catch (error) {
          this.logger.warn(
            `Failed to extract attachment ${index}: ${(error as Error).message}`
          );
          return null;
        }
      })
      .filter(Boolean) as ParsedEmailAttachment[];
  }

  /**
   * Build formatted email content string (for document storage)
   *
   * Matches the format used by Gmail/IMAP provider for consistency.
   */
  buildEmailContent(email: ParsedEmailFile): string {
    const parts: string[] = [];

    // Header section
    parts.push(`Subject: ${email.subject || '(No Subject)'}`);
    parts.push(`From: ${this.formatAddresses(email.from) || 'Unknown'}`);
    parts.push(`To: ${this.formatAddresses(email.to) || ''}`);

    if (email.cc && email.cc.length > 0) {
      parts.push(`CC: ${this.formatAddresses(email.cc)}`);
    }

    if (email.bcc && email.bcc.length > 0) {
      parts.push(`BCC: ${this.formatAddresses(email.bcc)}`);
    }

    parts.push(`Date: ${email.date ? email.date.toISOString() : 'Unknown'}`);

    // Blank line before body
    parts.push('');

    // Body content - prefer text, strip HTML as fallback
    if (email.textBody) {
      parts.push(email.textBody);
    } else if (email.htmlBody) {
      parts.push(this.stripHtml(email.htmlBody));
    }

    return parts.join('\n');
  }

  /**
   * Format email addresses for display
   */
  private formatAddresses(addresses: EmailAddress[] | undefined): string {
    if (!addresses || addresses.length === 0) {
      return '';
    }

    return addresses
      .map((a) => (a.name ? `${a.name} <${a.address}>` : a.address))
      .join(', ');
  }

  /**
   * Strip HTML tags and decode common entities
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  /**
   * Build metadata object for document storage
   */
  buildEmailMetadata(
    email: ParsedEmailFile,
    options?: { provider?: string }
  ): Record<string, any> {
    return {
      messageId: email.messageId,
      from: email.from,
      to: email.to,
      cc: email.cc,
      bcc: email.bcc,
      date: email.date?.toISOString(),
      subject: email.subject,
      inReplyTo: email.inReplyTo,
      references: email.references,
      hasAttachments: (email.attachments?.length ?? 0) > 0,
      attachmentCount: email.attachments?.length ?? 0,
      provider: options?.provider || 'upload',
    };
  }
}

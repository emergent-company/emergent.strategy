import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  IsDate,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Email address DTO
 */
export class EmailAddressDto {
  /**
   * Display name (e.g., 'John Doe')
   */
  @IsString()
  @IsOptional()
  name?: string;

  /**
   * Email address (e.g., 'john@example.com')
   */
  @IsString()
  address: string;
}

/**
 * Email attachment preview DTO
 */
export class EmailAttachmentPreviewDto {
  /**
   * Attachment filename
   */
  @IsString()
  filename: string;

  /**
   * MIME content type
   */
  @IsString()
  contentType: string;

  /**
   * Size in bytes
   */
  @IsNumber()
  size: number;

  /**
   * Content-ID for inline attachments
   */
  @IsString()
  @IsOptional()
  contentId?: string;

  /**
   * Whether this is an inline attachment
   */
  @IsBoolean()
  @IsOptional()
  inline?: boolean;
}

/**
 * Email preview DTO
 *
 * Lightweight representation of an email for browsing/selection.
 * Does not include full body content.
 */
export class ImapEmailPreviewDto {
  /**
   * Unique ID in the mailbox (UID)
   */
  @IsNumber()
  uid: number;

  /**
   * Message sequence number
   */
  @IsNumber()
  @IsOptional()
  seqNo?: number;

  /**
   * Message-ID header (used for deduplication)
   */
  @IsString()
  @IsOptional()
  messageId?: string;

  /**
   * Email subject
   */
  @IsString()
  subject: string;

  /**
   * From addresses
   */
  @IsArray()
  @Type(() => EmailAddressDto)
  from: EmailAddressDto[];

  /**
   * To addresses
   */
  @IsArray()
  @Type(() => EmailAddressDto)
  to: EmailAddressDto[];

  /**
   * CC addresses
   */
  @IsArray()
  @Type(() => EmailAddressDto)
  @IsOptional()
  cc?: EmailAddressDto[];

  /**
   * Date sent
   */
  @IsDate()
  @Type(() => Date)
  date: Date;

  /**
   * Date received (internal date)
   */
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  receivedDate?: Date;

  /**
   * Folder/mailbox this email is in
   */
  @IsString()
  folder: string;

  /**
   * Message flags (e.g., '\Seen', '\Answered', '\Flagged')
   */
  @IsArray()
  @IsOptional()
  flags?: string[];

  /**
   * Whether the email has been read
   */
  @IsBoolean()
  @IsOptional()
  seen?: boolean;

  /**
   * Whether the email is flagged/starred
   */
  @IsBoolean()
  @IsOptional()
  flagged?: boolean;

  /**
   * Brief text snippet/preview
   */
  @IsString()
  @IsOptional()
  snippet?: string;

  /**
   * Size of the email in bytes
   */
  @IsNumber()
  @IsOptional()
  size?: number;

  /**
   * Whether the email has attachments
   */
  @IsBoolean()
  hasAttachments: boolean;

  /**
   * Number of attachments
   */
  @IsNumber()
  @IsOptional()
  attachmentCount?: number;

  /**
   * Attachment previews (filename, size, type)
   */
  @IsArray()
  @Type(() => EmailAttachmentPreviewDto)
  @IsOptional()
  attachments?: EmailAttachmentPreviewDto[];

  /**
   * References header (for threading)
   */
  @IsString()
  @IsOptional()
  references?: string;

  /**
   * In-Reply-To header (for threading)
   */
  @IsString()
  @IsOptional()
  inReplyTo?: string;
}

/**
 * Full email content DTO (used during import)
 */
export class ImapEmailFullDto extends ImapEmailPreviewDto {
  /**
   * Plain text body
   */
  @IsString()
  @IsOptional()
  textBody?: string;

  /**
   * HTML body
   */
  @IsString()
  @IsOptional()
  htmlBody?: string;

  /**
   * Raw headers as key-value pairs
   */
  @IsOptional()
  headers?: Record<string, string | string[]>;

  /**
   * Raw MIME body structure (for attachment downloading)
   * Contains part numbers needed to download individual attachments
   */
  @IsOptional()
  bodyStructure?: any;
}

import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';

/**
 * IMAP Folder DTO
 *
 * Represents a mailbox/folder from the IMAP server
 */
export class ImapFolderDto {
  /**
   * Folder path (e.g., 'INBOX', 'INBOX/Subfolder', '[Gmail]/Sent Mail')
   */
  @IsString()
  path: string;

  /**
   * Display name for the folder
   */
  @IsString()
  name: string;

  /**
   * Delimiter used in folder path (usually '/' or '.')
   */
  @IsString()
  @IsOptional()
  delimiter?: string;

  /**
   * Parent folder path (null for root folders)
   */
  @IsString()
  @IsOptional()
  parent?: string | null;

  /**
   * Child folders (populated when fetching hierarchy)
   */
  @IsArray()
  @IsOptional()
  children?: ImapFolderDto[];

  /**
   * Total messages in this folder
   */
  @IsNumber()
  @IsOptional()
  messageCount?: number;

  /**
   * Number of unread messages
   */
  @IsNumber()
  @IsOptional()
  unseenCount?: number;

  /**
   * IMAP flags for this folder
   */
  @IsArray()
  @IsOptional()
  flags?: string[];

  /**
   * Whether this folder is selectable (can contain messages)
   */
  selectable: boolean;

  /**
   * Whether this folder has children
   */
  hasChildren: boolean;

  /**
   * Special use attribute (e.g., '\Inbox', '\Sent', '\Trash', '\Drafts')
   */
  @IsString()
  @IsOptional()
  specialUse?: string;
}

/**
 * IMAP folder list response
 */
export class ImapFolderListDto {
  /**
   * List of folders (may be hierarchical)
   */
  folders: ImapFolderDto[];

  /**
   * Total folder count
   */
  total: number;
}

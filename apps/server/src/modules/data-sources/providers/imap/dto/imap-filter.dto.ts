import {
  IsString,
  IsOptional,
  IsArray,
  IsDate,
  IsBoolean,
  IsEnum,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Filter comparison operators
 */
export enum FilterOperator {
  EQUALS = 'equals',
  CONTAINS = 'contains',
  STARTS_WITH = 'starts_with',
  ENDS_WITH = 'ends_with',
}

/**
 * Date filter options
 */
export enum DateFilterType {
  BEFORE = 'before',
  AFTER = 'after',
  ON = 'on',
  BETWEEN = 'between',
}

/**
 * Size filter options
 */
export enum SizeFilterType {
  LARGER = 'larger',
  SMALLER = 'smaller',
}

/**
 * IMAP filter DTO
 *
 * Criteria for filtering emails when browsing/importing
 */
export class ImapFilterDto {
  /**
   * Folders to search in (empty = all folders)
   */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  folders?: string[];

  /**
   * Filter by From address
   */
  @IsString()
  @IsOptional()
  from?: string;

  /**
   * Filter by To address
   */
  @IsString()
  @IsOptional()
  to?: string;

  /**
   * Filter by Subject (contains)
   */
  @IsString()
  @IsOptional()
  subject?: string;

  /**
   * Full text search in body
   */
  @IsString()
  @IsOptional()
  body?: string;

  /**
   * General text search (searches from, to, subject, body)
   */
  @IsString()
  @IsOptional()
  text?: string;

  /**
   * Date filter type
   */
  @IsEnum(DateFilterType)
  @IsOptional()
  dateType?: DateFilterType;

  /**
   * Date for before/after/on filters
   */
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  date?: Date;

  /**
   * Start date for between filter
   */
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  dateFrom?: Date;

  /**
   * End date for between filter
   */
  @IsDate()
  @Type(() => Date)
  @IsOptional()
  dateTo?: Date;

  /**
   * Size filter type
   */
  @IsEnum(SizeFilterType)
  @IsOptional()
  sizeType?: SizeFilterType;

  /**
   * Size threshold in bytes
   */
  @IsNumber()
  @IsOptional()
  sizeBytes?: number;

  /**
   * Filter by seen/unseen status
   */
  @IsBoolean()
  @IsOptional()
  seen?: boolean;

  /**
   * Filter by flagged/starred status
   */
  @IsBoolean()
  @IsOptional()
  flagged?: boolean;

  /**
   * Filter by answered status
   */
  @IsBoolean()
  @IsOptional()
  answered?: boolean;

  /**
   * Filter by has attachments
   */
  @IsBoolean()
  @IsOptional()
  hasAttachments?: boolean;

  /**
   * Specific Message-IDs to fetch
   */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  messageIds?: string[];

  /**
   * Specific UIDs to fetch
   */
  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  uids?: number[];
}

/**
 * IMAP browse request DTO
 */
export class ImapBrowseRequestDto {
  /**
   * Filter criteria
   */
  @Type(() => ImapFilterDto)
  @IsOptional()
  filter?: ImapFilterDto;

  /**
   * Page offset for pagination
   */
  @IsNumber()
  @Min(0)
  @IsOptional()
  offset?: number;

  /**
   * Number of items per page
   */
  @IsNumber()
  @Min(1)
  @Max(200)
  @IsOptional()
  limit?: number;

  /**
   * Sort by field
   */
  @IsString()
  @IsOptional()
  sortBy?: 'date' | 'from' | 'subject' | 'size';

  /**
   * Sort direction
   */
  @IsString()
  @IsOptional()
  sortDir?: 'asc' | 'desc';
}

/**
 * IMAP import request DTO
 */
export class ImapImportRequestDto {
  /**
   * Specific email UIDs to import (if importing selected emails)
   * Format: "folder:uid" to uniquely identify emails
   */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  emailIds?: string[];

  /**
   * Filter criteria for bulk import (if importing all matching)
   */
  @Type(() => ImapFilterDto)
  @IsOptional()
  filter?: ImapFilterDto;

  /**
   * Whether to import attachments as separate documents
   */
  @IsBoolean()
  @IsOptional()
  importAttachments?: boolean;

  /**
   * Maximum number of emails to import (safety limit)
   */
  @IsNumber()
  @Min(1)
  @Max(10000)
  @IsOptional()
  maxEmails?: number;

  /**
   * Whether to skip emails that have already been imported (by Message-ID)
   */
  @IsBoolean()
  @IsOptional()
  skipDuplicates?: boolean;
}

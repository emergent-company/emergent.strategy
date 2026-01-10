/**
 * Kreuzberg Document Extraction Service Interfaces
 *
 * These interfaces define the request and response types for the Kreuzberg
 * document extraction service (https://github.com/Goldziher/kreuzberg).
 */

/**
 * Result from Kreuzberg document extraction
 */
export interface KreuzbergExtractResult {
  /**
   * Extracted text content from the document
   */
  content: string;

  /**
   * Document metadata extracted during parsing
   */
  metadata?: {
    /** Number of pages in the document */
    page_count?: number;
    /** Document title */
    title?: string;
    /** Document author */
    author?: string;
    /** Document creation date */
    creation_date?: string;
    /** Document modification date */
    modification_date?: string;
    /** PDF producer/creator software */
    producer?: string;
    /** Additional custom metadata */
    [key: string]: string | number | boolean | undefined;
  };

  /**
   * Tables extracted from the document
   */
  tables?: Array<{
    /** Page number where the table was found (1-indexed) */
    page?: number;
    /** Table data as 2D array of cell values */
    data: string[][];
  }>;

  /**
   * Images extracted from the document
   */
  images?: Array<{
    /** Page number where the image was found (1-indexed) */
    page?: number;
    /** Base64-encoded image data */
    data: string;
    /** Image MIME type (e.g., 'image/png', 'image/jpeg') */
    mime_type: string;
  }>;
}

/**
 * Health check response from Kreuzberg service
 */
export interface KreuzbergHealthResponse {
  /** Service health status */
  status: 'healthy' | 'unhealthy';
  /** Service version */
  version?: string;
  /** Additional health details */
  details?: Record<string, unknown>;
}

/**
 * Error response from Kreuzberg service
 */
export interface KreuzbergErrorResponse {
  /** Error message */
  error: string;
  /** Detailed error description */
  detail?: string;
  /** HTTP status code */
  status_code?: number;
}

/**
 * Options for Kreuzberg extraction request
 */
export interface KreuzbergExtractOptions {
  /**
   * Timeout in milliseconds for the extraction request
   */
  timeoutMs?: number;

  /**
   * Whether to extract tables from the document
   */
  extractTables?: boolean;

  /**
   * Whether to extract images from the document
   */
  extractImages?: boolean;

  /**
   * OCR language hint (e.g., 'eng', 'deu', 'fra')
   */
  ocrLanguage?: string;
}

/**
 * MIME types supported by Kreuzberg for extraction (requires conversion/OCR)
 * Based on https://kreuzberg.dev/features/ - 56 file formats supported
 */
export const KREUZBERG_SUPPORTED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.oasis.opendocument.text', // .odt (LibreOffice Writer)

  // Spreadsheets
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel.sheet.macroEnabled.12', // .xlsm
  'application/vnd.ms-excel.sheet.binary.macroEnabled.12', // .xlsb
  'application/vnd.oasis.opendocument.spreadsheet', // .ods (LibreOffice Calc)

  // Presentations
  'application/vnd.ms-powerpoint', // .ppt
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx

  // Images (for OCR)
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/webp',
  'image/jp2', // JPEG 2000
  'image/jpx', // JPEG 2000
  'image/x-portable-anymap', // PNM
  'image/x-portable-bitmap', // PBM
  'image/x-portable-graymap', // PGM
  'image/x-portable-pixmap', // PPM

  // Email
  'message/rfc822', // .eml
  'application/vnd.ms-outlook', // .msg

  // Web & Markup (HTML needs conversion to markdown)
  'text/html',
  'image/svg+xml', // SVG

  // Rich Text
  'application/rtf',

  // Archives (Kreuzberg can extract from these)
  'application/zip',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
  'application/x-7z-compressed',
] as const;

/**
 * MIME types that should bypass Kreuzberg (plain text - direct read)
 */
export const PLAIN_TEXT_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/tab-separated-values', // .tsv
  'text/xml',
  'application/json',
  'application/xml',
  'application/x-yaml',
  'text/yaml',
  'application/toml',
] as const;

/**
 * File extensions that should bypass Kreuzberg (plain text - direct read)
 */
export const PLAIN_TEXT_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.tsv',
  '.json',
  '.xml',
  '.yaml',
  '.yml',
  '.toml',
] as const;

/**
 * All supported file extensions for upload validation
 * Combines Kreuzberg formats + plain text formats
 */
export const ALL_SUPPORTED_EXTENSIONS = [
  // Documents
  '.pdf',
  '.doc',
  '.docx',
  '.odt',
  // Spreadsheets
  '.xls',
  '.xlsx',
  '.xlsm',
  '.xlsb',
  '.ods',
  // Presentations
  '.ppt',
  '.pptx',
  // Images
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.tiff',
  '.tif',
  '.webp',
  '.jp2',
  '.jpx',
  '.jpm',
  '.mj2',
  '.pnm',
  '.pbm',
  '.pgm',
  '.ppm',
  '.svg',
  // Email
  '.eml',
  '.msg',
  // Web
  '.html',
  '.htm',
  // Rich Text
  '.rtf',
  // Archives
  '.zip',
  '.tar',
  '.tgz',
  '.gz',
  '.7z',
  // Plain text (direct read)
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.tsv',
  '.json',
  '.xml',
  '.yaml',
  '.yml',
  '.toml',
] as const;

/**
 * Check if a file should use Kreuzberg for extraction
 *
 * @param mimeType - MIME type of the file
 * @param filename - Original filename
 * @returns true if the file should be processed by Kreuzberg
 */
export function shouldUseKreuzberg(
  mimeType: string | null | undefined,
  filename: string | null | undefined
): boolean {
  // Check MIME type first
  if (mimeType && PLAIN_TEXT_MIME_TYPES.includes(mimeType as any)) {
    return false;
  }

  // Check file extension as fallback
  if (filename) {
    const ext = filename.toLowerCase().split('.').pop();
    if (ext && PLAIN_TEXT_EXTENSIONS.includes(`.${ext}` as any)) {
      return false;
    }
  }

  // Default to using Kreuzberg for unknown types
  return true;
}

/**
 * Check if a MIME type is supported by Kreuzberg
 *
 * @param mimeType - MIME type to check
 * @returns true if the MIME type is supported
 */
export function isKreuzbergSupported(mimeType: string): boolean {
  return KREUZBERG_SUPPORTED_MIME_TYPES.includes(mimeType as any);
}

/**
 * MIME types for email files that should be processed by EmailFileParserService
 * instead of Kreuzberg (to extract full metadata and attachments)
 */
export const EMAIL_MIME_TYPES = [
  'message/rfc822', // .eml (RFC 822 standard email)
  'application/vnd.ms-outlook', // .msg (Microsoft Outlook)
] as const;

/**
 * File extensions for email files
 */
export const EMAIL_EXTENSIONS = ['.eml', '.msg'] as const;

/**
 * Check if a file is an email file that should use EmailFileParserService
 *
 * Email files are routed to our native parser instead of Kreuzberg because:
 * - Kreuzberg only extracts limited metadata (from, to, cc, bcc, messageId)
 * - Kreuzberg does NOT extract: subject, date, inReplyTo, references
 * - Kreuzberg does NOT extract attachment binary content (only filenames)
 *
 * @param mimeType - MIME type of the file
 * @param filename - Original filename
 * @returns true if the file should be processed as an email
 */
export function isEmailFile(
  mimeType: string | null | undefined,
  filename: string | null | undefined
): boolean {
  // Check MIME type first (most reliable)
  if (mimeType && EMAIL_MIME_TYPES.includes(mimeType as any)) {
    return true;
  }

  // Check file extension as fallback
  if (filename) {
    const ext = filename.toLowerCase().split('.').pop();
    if (ext && EMAIL_EXTENSIONS.includes(`.${ext}` as any)) {
      return true;
    }
  }

  return false;
}

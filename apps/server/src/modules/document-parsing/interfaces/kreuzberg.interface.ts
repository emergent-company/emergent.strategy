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
 * MIME types supported by Kreuzberg for extraction
 */
export const KREUZBERG_SUPPORTED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/rtf',
  'text/html',
  // Images (for OCR)
  'image/png',
  'image/jpeg',
  'image/tiff',
  'image/bmp',
  'image/gif',
  'image/webp',
] as const;

/**
 * MIME types that should bypass Kreuzberg (plain text)
 */
export const PLAIN_TEXT_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/xml',
  'application/json',
  'application/xml',
] as const;

/**
 * File extensions that should bypass Kreuzberg (plain text)
 */
export const PLAIN_TEXT_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.xml',
  '.yaml',
  '.yml',
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

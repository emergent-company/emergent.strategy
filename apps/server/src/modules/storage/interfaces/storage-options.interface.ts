/**
 * Options for storage upload operations
 */
export interface StorageUploadOptions {
  /**
   * Target bucket name. Defaults to documents bucket.
   */
  bucket?: string;

  /**
   * Content type (MIME type) of the file
   */
  contentType?: string;

  /**
   * Custom metadata to store with the object
   */
  metadata?: Record<string, string>;

  /**
   * Content disposition (e.g., 'attachment; filename="file.pdf"')
   */
  contentDisposition?: string;

  /**
   * Cache control header value
   */
  cacheControl?: string;
}

/**
 * Options for generating signed URLs
 */
export interface SignedUrlOptions {
  /**
   * Expiration time in seconds (default: 3600 = 1 hour)
   */
  expiresIn?: number;

  /**
   * Content type for PUT operations
   */
  contentType?: string;

  /**
   * Response content disposition for GET operations
   */
  responseContentDisposition?: string;
}

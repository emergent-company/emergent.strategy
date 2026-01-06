/**
 * Storage upload result interface
 */
export interface StorageUploadResult {
  /**
   * Storage key (path) where the file was stored
   */
  key: string;

  /**
   * Bucket name where the file was stored
   */
  bucket: string;

  /**
   * ETag of the uploaded file (for verification)
   */
  etag?: string;

  /**
   * Version ID if bucket versioning is enabled
   */
  versionId?: string;

  /**
   * Size in bytes of the uploaded file
   */
  size: number;

  /**
   * Content type (MIME type) of the file
   */
  contentType?: string;
}

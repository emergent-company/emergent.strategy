import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { MinioProvider } from './providers/minio.provider';
import {
  StorageUploadResult,
  StorageUploadOptions,
  SignedUrlOptions,
} from './interfaces';

/**
 * Options for document upload with organizational context
 */
export interface DocumentUploadOptions extends StorageUploadOptions {
  /**
   * Organization ID for namespacing
   */
  orgId: string;

  /**
   * Project ID for namespacing
   */
  projectId: string;

  /**
   * Original filename (used for content disposition)
   */
  filename?: string;
}

/**
 * Extended upload result with full storage URL
 */
export interface DocumentUploadResult extends StorageUploadResult {
  /**
   * Full URL to access the stored file (may require signed URL for access)
   */
  storageUrl: string;
}

/**
 * Storage service providing a high-level interface for document storage operations.
 * Wraps the underlying storage provider (MinIO) and adds business logic for:
 * - Generating storage keys with organization/project namespacing
 * - Handling different buckets (documents, temp)
 * - Providing convenience methods for common operations
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly minioProvider: MinioProvider) {}

  /**
   * Upload a document to the documents bucket with proper namespacing.
   * Storage key format: {projectId}/{orgId}/{uuid}-{filename}
   *
   * @param buffer - File content as Buffer
   * @param options - Upload options including orgId, projectId, and optional filename
   * @returns Upload result with storage key and URL
   */
  async uploadDocument(
    buffer: Buffer,
    options: DocumentUploadOptions
  ): Promise<DocumentUploadResult> {
    const { orgId, projectId, filename, ...uploadOptions } = options;

    // Generate unique storage key with namespacing
    const uuid = uuidv4();
    const sanitizedFilename = filename
      ? this.sanitizeFilename(filename)
      : 'document';
    const key = `${projectId}/${orgId}/${uuid}-${sanitizedFilename}`;

    // Set content disposition if filename provided
    if (filename && !uploadOptions.contentDisposition) {
      uploadOptions.contentDisposition = `attachment; filename="${filename}"`;
    }

    const result = await this.minioProvider.upload(buffer, key, uploadOptions);

    // Generate the storage URL (bucket/key format for internal reference)
    const storageUrl = `${result.bucket}/${result.key}`;

    this.logger.debug(
      `Document uploaded: ${key} (${buffer.length} bytes, org: ${orgId}, project: ${projectId})`
    );

    return {
      ...result,
      storageUrl,
    };
  }

  /**
   * Upload a file to the temporary bucket.
   * Used for intermediate processing (e.g., before document parsing).
   *
   * @param buffer - File content as Buffer
   * @param filename - Original filename
   * @param options - Additional upload options
   * @returns Upload result with storage key
   */
  async uploadToTemp(
    buffer: Buffer,
    filename: string,
    options: Omit<StorageUploadOptions, 'bucket'> = {}
  ): Promise<StorageUploadResult> {
    const uuid = uuidv4();
    const sanitizedFilename = this.sanitizeFilename(filename);
    const key = `temp/${uuid}-${sanitizedFilename}`;

    const result = await this.minioProvider.upload(buffer, key, {
      ...options,
      bucket: 'document-temp',
      contentDisposition: `attachment; filename="${filename}"`,
    });

    this.logger.debug(`Temp file uploaded: ${key} (${buffer.length} bytes)`);
    return result;
  }

  /**
   * Download a file from storage.
   *
   * @param key - Storage key
   * @param bucket - Optional bucket name (defaults to documents bucket)
   * @returns File content as Buffer
   */
  async download(key: string, bucket?: string): Promise<Buffer> {
    return this.minioProvider.download(key, bucket);
  }

  /**
   * Delete a file from storage.
   *
   * @param key - Storage key
   * @param bucket - Optional bucket name (defaults to documents bucket)
   */
  async delete(key: string, bucket?: string): Promise<void> {
    await this.minioProvider.delete(key, bucket);
    this.logger.debug(`File deleted: ${bucket || 'documents'}/${key}`);
  }

  /**
   * Generate a signed URL for downloading a file.
   *
   * @param key - Storage key
   * @param options - Signed URL options (expiration, content disposition)
   * @param bucket - Optional bucket name (defaults to documents bucket)
   * @returns Signed URL string
   */
  async getSignedDownloadUrl(
    key: string,
    options: SignedUrlOptions = {},
    bucket?: string
  ): Promise<string> {
    return this.minioProvider.getSignedUrl(key, options, bucket);
  }

  /**
   * Generate a signed URL for uploading a file directly.
   *
   * @param key - Storage key
   * @param options - Signed URL options (expiration, content type)
   * @param bucket - Optional bucket name (defaults to documents bucket)
   * @returns Signed URL string for PUT operation
   */
  async getSignedUploadUrl(
    key: string,
    options: SignedUrlOptions = {},
    bucket?: string
  ): Promise<string> {
    return this.minioProvider.getUploadSignedUrl(key, options, bucket);
  }

  /**
   * Check if a file exists in storage.
   *
   * @param key - Storage key
   * @param bucket - Optional bucket name (defaults to documents bucket)
   * @returns true if file exists
   */
  async exists(key: string, bucket?: string): Promise<boolean> {
    return this.minioProvider.exists(key, bucket);
  }

  /**
   * Get file metadata without downloading.
   *
   * @param key - Storage key
   * @param bucket - Optional bucket name (defaults to documents bucket)
   * @returns File metadata or null if not found
   */
  async getMetadata(
    key: string,
    bucket?: string
  ): Promise<{
    size: number;
    contentType?: string;
    lastModified?: Date;
  } | null> {
    return this.minioProvider.getMetadata(key, bucket);
  }

  /**
   * Generate a storage key for a document.
   * Useful when you need to know the key before uploading.
   *
   * @param projectId - Project ID
   * @param orgId - Organization ID
   * @param filename - Original filename
   * @returns Generated storage key
   */
  generateDocumentKey(
    projectId: string,
    orgId: string,
    filename: string
  ): string {
    const uuid = uuidv4();
    const sanitizedFilename = this.sanitizeFilename(filename);
    return `${projectId}/${orgId}/${uuid}-${sanitizedFilename}`;
  }

  /**
   * Parse a storage URL to extract bucket and key.
   *
   * @param storageUrl - Storage URL in format "bucket/key"
   * @returns Object with bucket and key
   */
  parseStorageUrl(storageUrl: string): { bucket: string; key: string } {
    const firstSlash = storageUrl.indexOf('/');
    if (firstSlash === -1) {
      throw new Error(`Invalid storage URL format: ${storageUrl}`);
    }
    return {
      bucket: storageUrl.substring(0, firstSlash),
      key: storageUrl.substring(firstSlash + 1),
    };
  }

  /**
   * Sanitize filename for storage key.
   * Removes or replaces problematic characters.
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special chars with underscore
      .replace(/_{2,}/g, '_') // Collapse multiple underscores
      .replace(/^_|_$/g, '') // Trim leading/trailing underscores
      .toLowerCase()
      .substring(0, 200); // Limit length
  }
}

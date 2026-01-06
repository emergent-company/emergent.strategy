import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Logger, Injectable, OnModuleInit } from '@nestjs/common';
import { Readable } from 'stream';
import {
  StorageUploadResult,
  StorageUploadOptions,
  SignedUrlOptions,
} from '../interfaces';
import { AppConfigService } from '../../../common/config/config.service';

/**
 * MinIO storage provider implementing S3-compatible storage operations.
 * Used for development and local deployments.
 */
@Injectable()
export class MinioProvider implements OnModuleInit {
  private readonly logger = new Logger(MinioProvider.name);
  private client!: S3Client;
  private defaultBucket!: string;

  constructor(private readonly config: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    const endpoint = this.config.storageEndpoint;
    const accessKey = this.config.storageAccessKey;
    const secretKey = this.config.storageSecretKey;
    const region = this.config.storageRegion || 'us-east-1';

    if (!endpoint || !accessKey || !secretKey) {
      this.logger.warn(
        'Storage credentials not configured. Storage operations will fail.'
      );
      return;
    }

    this.client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle: true, // Required for MinIO
    });

    this.defaultBucket = this.config.storageBucketDocuments || 'documents';
    this.logger.log(
      `MinIO provider initialized with endpoint: ${endpoint}, bucket: ${this.defaultBucket}`
    );
  }

  /**
   * Upload a file to storage
   */
  async upload(
    buffer: Buffer,
    key: string,
    options: StorageUploadOptions = {}
  ): Promise<StorageUploadResult> {
    const bucket = options.bucket || this.defaultBucket;

    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: options.contentType,
        Metadata: options.metadata,
        ContentDisposition: options.contentDisposition,
        CacheControl: options.cacheControl,
      });

      const result = await this.client.send(command);

      this.logger.debug(`Uploaded file to ${bucket}/${key}`);

      return {
        key,
        bucket,
        etag: result.ETag?.replace(/"/g, ''),
        versionId: result.VersionId,
        size: buffer.length,
        contentType: options.contentType,
      };
    } catch (error) {
      this.logger.error(`Failed to upload to ${bucket}/${key}`, error);
      throw this.mapError(error, 'upload', key);
    }
  }

  /**
   * Download a file from storage
   */
  async download(key: string, bucket?: string): Promise<Buffer> {
    const targetBucket = bucket || this.defaultBucket;

    try {
      const command = new GetObjectCommand({
        Bucket: targetBucket,
        Key: key,
      });

      const result = await this.client.send(command);

      if (!result.Body) {
        throw new Error(`Empty response body for ${targetBucket}/${key}`);
      }

      // Convert stream to buffer
      const stream = result.Body as Readable;
      const chunks: Buffer[] = [];

      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }

      return Buffer.concat(chunks);
    } catch (error) {
      this.logger.error(
        `Failed to download from ${targetBucket}/${key}`,
        error
      );
      throw this.mapError(error, 'download', key);
    }
  }

  /**
   * Delete a file from storage
   */
  async delete(key: string, bucket?: string): Promise<void> {
    const targetBucket = bucket || this.defaultBucket;

    try {
      const command = new DeleteObjectCommand({
        Bucket: targetBucket,
        Key: key,
      });

      await this.client.send(command);
      this.logger.debug(`Deleted file ${targetBucket}/${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete ${targetBucket}/${key}`, error);
      throw this.mapError(error, 'delete', key);
    }
  }

  /**
   * Generate a signed URL for accessing a file
   */
  async getSignedUrl(
    key: string,
    options: SignedUrlOptions = {},
    bucket?: string
  ): Promise<string> {
    const targetBucket = bucket || this.defaultBucket;
    const expiresIn = options.expiresIn || 3600; // 1 hour default

    try {
      const command = new GetObjectCommand({
        Bucket: targetBucket,
        Key: key,
        ResponseContentDisposition: options.responseContentDisposition,
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });
      return url;
    } catch (error) {
      this.logger.error(
        `Failed to generate signed URL for ${targetBucket}/${key}`,
        error
      );
      throw this.mapError(error, 'getSignedUrl', key);
    }
  }

  /**
   * Generate a signed URL for uploading a file
   */
  async getUploadSignedUrl(
    key: string,
    options: SignedUrlOptions = {},
    bucket?: string
  ): Promise<string> {
    const targetBucket = bucket || this.defaultBucket;
    const expiresIn = options.expiresIn || 3600;

    try {
      const command = new PutObjectCommand({
        Bucket: targetBucket,
        Key: key,
        ContentType: options.contentType,
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });
      return url;
    } catch (error) {
      this.logger.error(
        `Failed to generate upload signed URL for ${targetBucket}/${key}`,
        error
      );
      throw this.mapError(error, 'getUploadSignedUrl', key);
    }
  }

  /**
   * Check if a file exists in storage
   */
  async exists(key: string, bucket?: string): Promise<boolean> {
    const targetBucket = bucket || this.defaultBucket;

    try {
      const command = new HeadObjectCommand({
        Bucket: targetBucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      if (error instanceof S3ServiceException && error.name === 'NotFound') {
        return false;
      }
      // For other errors, we should log but not throw to avoid breaking the check
      this.logger.warn(
        `Error checking existence of ${targetBucket}/${key}`,
        error
      );
      return false;
    }
  }

  /**
   * Get file metadata without downloading
   */
  async getMetadata(
    key: string,
    bucket?: string
  ): Promise<{
    size: number;
    contentType?: string;
    lastModified?: Date;
  } | null> {
    const targetBucket = bucket || this.defaultBucket;

    try {
      const command = new HeadObjectCommand({
        Bucket: targetBucket,
        Key: key,
      });

      const result = await this.client.send(command);

      return {
        size: result.ContentLength || 0,
        contentType: result.ContentType,
        lastModified: result.LastModified,
      };
    } catch (error) {
      if (error instanceof S3ServiceException && error.name === 'NotFound') {
        return null;
      }
      throw this.mapError(error, 'getMetadata', key);
    }
  }

  /**
   * Map S3 errors to more meaningful exceptions
   */
  private mapError(error: unknown, operation: string, key: string): Error {
    if (error instanceof S3ServiceException) {
      const message = `Storage ${operation} failed for '${key}': ${error.message}`;

      switch (error.name) {
        case 'NoSuchKey':
        case 'NotFound':
          return new StorageNotFoundError(message);
        case 'AccessDenied':
          return new StorageAccessDeniedError(message);
        case 'NoSuchBucket':
          return new StorageBucketNotFoundError(message);
        default:
          return new StorageError(message, error.name);
      }
    }

    if (error instanceof Error) {
      return new StorageError(
        `Storage ${operation} failed for '${key}': ${error.message}`
      );
    }

    return new StorageError(`Storage ${operation} failed for '${key}'`);
  }
}

/**
 * Base storage error class
 */
export class StorageError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Error thrown when a file is not found
 */
export class StorageNotFoundError extends StorageError {
  constructor(message: string) {
    super(message, 'NOT_FOUND');
    this.name = 'StorageNotFoundError';
  }
}

/**
 * Error thrown when access is denied
 */
export class StorageAccessDeniedError extends StorageError {
  constructor(message: string) {
    super(message, 'ACCESS_DENIED');
    this.name = 'StorageAccessDeniedError';
  }
}

/**
 * Error thrown when bucket is not found
 */
export class StorageBucketNotFoundError extends StorageError {
  constructor(message: string) {
    super(message, 'BUCKET_NOT_FOUND');
    this.name = 'StorageBucketNotFoundError';
  }
}

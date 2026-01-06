import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';
import { MinioProvider } from './providers/minio.provider';

/**
 * Storage module providing document storage capabilities.
 *
 * This module is marked as @Global() so StorageService can be injected
 * anywhere without explicitly importing StorageModule.
 *
 * Currently uses MinIO as the storage provider. Future providers
 * (S3, GCS) can be added by implementing a provider interface
 * and using a factory to select based on configuration.
 *
 * Usage:
 * ```typescript
 * @Injectable()
 * export class MyService {
 *   constructor(private readonly storage: StorageService) {}
 *
 *   async uploadDocument(buffer: Buffer) {
 *     return this.storage.uploadDocument(buffer, {
 *       orgId: 'org-123',
 *       projectId: 'proj-456',
 *       filename: 'document.pdf',
 *       contentType: 'application/pdf',
 *     });
 *   }
 * }
 * ```
 */
@Global()
@Module({
  providers: [MinioProvider, StorageService],
  exports: [StorageService],
})
export class StorageModule {}

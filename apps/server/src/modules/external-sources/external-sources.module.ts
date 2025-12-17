import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalSourcesController } from './external-sources.controller';
import { ExternalSourcesService } from './external-sources.service';
import { ExternalSourceProviderRegistry } from './external-source-provider-registry.service';
import { ExternalSourceSyncWorkerService } from './external-source-sync-worker.service';
import { ExternalLinkDetector } from './external-link-detector.service';
import { ImportDocumentTool } from './import-document.tool';
import { GoogleDriveProvider, UrlProvider } from './providers';
import { AuthModule } from '../auth/auth.module';
import { IngestionModule } from '../ingestion/ingestion.module';
import { DatabaseModule } from '../../common/database/database.module';
import { LangfuseModule } from '../langfuse/langfuse.module';
import { ExternalSource } from '../../entities/external-source.entity';
import { Document } from '../../entities/document.entity';

/**
 * Module for managing external sources (Google Drive, URLs, etc.)
 *
 * Provides:
 * - Provider registry for detecting and handling different source types
 * - Service for importing, syncing, and managing external sources
 * - REST API endpoints for external source operations
 * - Background worker for periodic sync operations
 * - Link detector for chat integration
 * - MCP tool for AI agent document imports
 *
 * Provider system is extensible - new providers can be added to the registry.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ExternalSource, Document]),
    AuthModule,
    IngestionModule,
    DatabaseModule,
    LangfuseModule,
  ],
  controllers: [ExternalSourcesController],
  providers: [
    ExternalSourcesService,
    ExternalSourceProviderRegistry,
    ExternalSourceSyncWorkerService,
    ExternalLinkDetector,
    ImportDocumentTool,
    GoogleDriveProvider,
    UrlProvider,
  ],
  exports: [
    ExternalSourcesService,
    ExternalSourceProviderRegistry,
    ExternalLinkDetector,
    ImportDocumentTool,
  ],
})
export class ExternalSourcesModule {}

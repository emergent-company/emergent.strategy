import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSourceIntegration } from '../../entities/data-source-integration.entity';
import { DataSourceSyncJob } from '../../entities/data-source-sync-job.entity';
import { Document } from '../../entities/document.entity';
import { Project } from '../../entities/project.entity';
import { DataSourceIntegrationsService } from './data-source-integrations.service';
import { DataSourceSyncJobService } from './data-source-sync-job.service';
import { DataSourceIntegrationsController } from './data-source-integrations.controller';
import { DataSourceProviderRegistry } from './providers/provider.registry';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { DocumentsModule } from '../documents/documents.module';
import { DocumentParsingModule } from '../document-parsing/document-parsing.module';
// IMAP Provider
import { ImapProvider } from './providers/imap/imap.provider';
import { ImapConnectionService } from './providers/imap/imap-connection.service';
// Gmail OAuth Provider
import { GoogleOAuthService } from './providers/gmail-oauth/google-oauth.service';
import { GmailOAuthProvider } from './providers/gmail-oauth/gmail-oauth.provider';
// Google Drive Provider
import { GoogleDriveApiService } from './providers/google-drive/google-drive-api.service';
import { GoogleDriveProvider } from './providers/google-drive/google-drive.provider';
// ClickUp Provider
import { ClickUpApiService } from './providers/clickup/clickup-api.service';
import { ClickUpProvider } from './providers/clickup/clickup.provider';

/**
 * Data Sources Module
 *
 * Provides infrastructure for managing data source integrations (IMAP, Gmail, future providers).
 * These integrations import external content as documents into the knowledge base.
 *
 * Features:
 * - CRUD operations for data source integrations
 * - Provider registry for extensible integration types
 * - Browse and import capabilities for external content
 * - Manual and recurring sync modes
 * - Configuration encryption via IntegrationsModule
 * - OAuth 2.0 support for Google services (Gmail, Drive)
 *
 * Providers:
 * - IMAP (generic email import via username/password)
 * - Gmail OAuth (Gmail import via Google OAuth 2.0)
 * - Google Drive (file import via Google OAuth 2.0)
 * - ClickUp (ClickUp Docs import via API token)
 *
 * Components:
 * - DataSourceIntegrationsService: Core CRUD and import operations
 * - DataSourceProviderRegistry: Central registry for provider implementations
 * - DataSourceIntegrationsController: REST API endpoints (/data-source-integrations)
 * - GoogleOAuthService: Reusable Google OAuth 2.0 service for Gmail/Drive
 *
 * Dependencies:
 * - IntegrationsModule: Provides EncryptionService for credential encryption
 * - AppConfigModule (Global): Provides AppConfigService for OAuth configuration
 *
 * Security:
 * - All endpoints require authentication
 * - Write operations require 'data-sources:write' scope
 * - Credentials encrypted using EncryptionService from IntegrationsModule
 * - OAuth tokens stored encrypted with automatic refresh
 *
 * @see openspec/changes/add-imap-data-sources/
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      DataSourceIntegration,
      DataSourceSyncJob,
      Document,
      Project,
    ]),
    IntegrationsModule, // For EncryptionService
    AuthModule, // For AuthGuard
    EventsModule, // For EventsService (sync job progress events)
    forwardRef(() => DocumentsModule), // For DocumentsService (chunking)
    forwardRef(() => DocumentParsingModule), // For DocumentParsingJobService (attachment parsing)
    // AppConfigModule is @Global, so AppConfigService is available automatically
  ],
  providers: [
    DataSourceProviderRegistry,
    DataSourceIntegrationsService,
    DataSourceSyncJobService,
    // IMAP Provider
    ImapConnectionService,
    ImapProvider,
    // Google OAuth (shared service for Gmail, Drive, etc.)
    GoogleOAuthService,
    // Gmail OAuth Provider
    GmailOAuthProvider,
    // Google Drive Provider
    GoogleDriveApiService,
    GoogleDriveProvider,
    // ClickUp Provider
    ClickUpApiService,
    ClickUpProvider,
  ],
  controllers: [DataSourceIntegrationsController],
  exports: [
    DataSourceIntegrationsService,
    DataSourceSyncJobService,
    DataSourceProviderRegistry,
    GoogleOAuthService, // Export for potential use by other modules
  ],
})
export class DataSourcesModule implements OnModuleInit {
  constructor(
    private readonly providerRegistry: DataSourceProviderRegistry,
    private readonly imapProvider: ImapProvider,
    private readonly gmailOAuthProvider: GmailOAuthProvider,
    private readonly googleDriveProvider: GoogleDriveProvider,
    private readonly clickupProvider: ClickUpProvider
  ) {}

  /**
   * Register all providers on module initialization
   */
  onModuleInit() {
    // Register IMAP provider (generic email via username/password)
    this.providerRegistry.register(this.imapProvider);

    // Register Gmail OAuth provider (Gmail via Google OAuth 2.0)
    this.providerRegistry.register(this.gmailOAuthProvider);

    // Register Google Drive provider (Drive via Google OAuth 2.0)
    this.providerRegistry.register(this.googleDriveProvider);

    // Register ClickUp provider (ClickUp Docs via API token)
    this.providerRegistry.register(this.clickupProvider);
  }
}

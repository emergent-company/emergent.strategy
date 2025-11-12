import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IntegrationsService } from './integrations.service';
import { IntegrationsController } from './integrations.controller';
import { EncryptionService } from './encryption.service';
import { IntegrationRegistryService } from './integration-registry.service';
import { Integration } from '../../entities/integration.entity';
import { AppConfigModule } from '../../common/config/config.module';

/**
 * Integrations Module
 *
 * Provides infrastructure for managing third-party integrations
 *
 * Features:
 * - CRUD operations for integration configurations
 * - AES-256 encryption for sensitive credentials
 * - Webhook secret generation and management
 * - Project-scoped integration management
 * - Plugin architecture for extensibility
 *
 * Integrations:
 * - ClickUp (implemented in ClickUpModule)
 * - Jira (future)
 * - GitHub (future)
 * - Linear (future)
 *
 * Components:
 * - IntegrationsService: Core CRUD operations and business logic
 * - EncryptionService: Credential encryption/decryption using PostgreSQL pgcrypto
 * - IntegrationRegistryService: Central registry for all integration plugins
 * - IntegrationsController: REST API endpoints (/integrations)
 *
 * Security:
 * - All endpoints require authentication
 * - Write operations require 'integrations:write' scope
 * - Credentials encrypted with INTEGRATION_ENCRYPTION_KEY env var
 * - Webhook secrets auto-generated (32-byte hex)
 *
 * @see docs/spec/23-integration-gallery.md
 * @see docs/INTEGRATION_GALLERY_IMPLEMENTATION_PLAN.md
 */
@Module({
  imports: [TypeOrmModule.forFeature([Integration]), AppConfigModule],
  providers: [
    IntegrationsService,
    EncryptionService,
    IntegrationRegistryService,
  ],
  controllers: [IntegrationsController],
  exports: [IntegrationsService, EncryptionService, IntegrationRegistryService],
})
export class IntegrationsModule {}

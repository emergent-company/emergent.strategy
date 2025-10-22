import { Module, OnModuleInit } from '@nestjs/common';
import { ClickUpIntegration } from './clickup.integration';
import { ClickUpApiClient } from './clickup-api.client';
import { ClickUpDataMapper } from './clickup-data-mapper.service';
import { ClickUpImportService } from './clickup-import.service';
import { ClickUpImportLoggerService } from './clickup-import-logger.service';
import { ClickUpWebhookHandler } from './clickup-webhook.handler';
import { IntegrationRegistryService } from '../integrations/integration-registry.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { DatabaseModule } from '../../common/database/database.module';
import { AppConfigModule } from '../../common/config/config.module';
import { ExtractionJobModule } from '../extraction-jobs/extraction-job.module';

/**
 * ClickUp Integration Module
 * 
 * Provides ClickUp integration capabilities:
 * - Full workspace import (spaces, folders, lists, tasks)
 * - Real-time webhook updates
 * - Rate-limited API client (100 req/min)
 * - Data mapping to internal document structure
 * 
 * Dependencies:
 * - IntegrationsModule: Base integration services
 * - DatabaseModule: Database access
 * - AppConfigModule: Configuration
 * 
 * Auto-registers ClickUpIntegration on module initialization.
 */
@Module({
    imports: [
        IntegrationsModule,
        DatabaseModule,
        AppConfigModule,
        ExtractionJobModule,
    ],
    providers: [
        ClickUpIntegration,
        ClickUpApiClient,
        ClickUpDataMapper,
        ClickUpImportService,
        ClickUpImportLoggerService,
        ClickUpWebhookHandler,
    ],
    exports: [
        ClickUpIntegration,
        ClickUpApiClient,
        ClickUpDataMapper,
        ClickUpImportService,
        ClickUpImportLoggerService,
        ClickUpWebhookHandler,
    ],
})
export class ClickUpModule implements OnModuleInit {
    constructor(
        private readonly registry: IntegrationRegistryService,
        private readonly clickUpIntegration: ClickUpIntegration
    ) { }

    /**
     * Register ClickUp integration on module initialization
     */
    async onModuleInit() {
        this.registry.register(this.clickUpIntegration);
    }
}

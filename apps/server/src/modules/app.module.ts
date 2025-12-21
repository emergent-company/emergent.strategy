import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenTelemetryModule } from 'nestjs-otel';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { SettingsModule } from './settings/settings.module';
import { DocumentsModule } from './documents/documents.module';
import { ChunksModule } from './chunks/chunks.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { ChatModule } from './chat/chat.module';
import { OrgsModule } from './orgs/orgs.module';
import { ProjectsModule } from './projects/projects.module';
import { SearchModule } from './search/search.module';
import { OpenApiModule } from './openapi/openapi.module';
import { DatabaseModule } from '../common/database/database.module';
import { AppConfigModule } from '../common/config/config.module';
import { UtilsModule } from '../common/utils/utils.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { InvitesModule } from './invites/invites.module';
import { UserProfileModule } from './user-profile/user-profile.module';
import { GraphModule } from './graph/graph.module';
import { GraphSearchModule } from './graph-search/graph-search.module';
import { UnifiedSearchModule } from './unified-search/unified-search.module';
import { TemplatePackModule } from './template-packs/template-pack.module';
import { TypeRegistryModule } from './type-registry/type-registry.module';
import { ExtractionJobModule } from './extraction-jobs/extraction-job.module';
import { DiscoveryJobModule } from './discovery-jobs/discovery-job.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TasksModule } from './tasks/tasks.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { ClickUpModule } from './clickup/clickup.module';
import { McpModule } from './mcp/mcp.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { UserModule } from './user/user.module';
import { ChatUiModule } from './chat-ui/chat-ui.module';
import { ChatSdkModule } from './chat-sdk/chat-sdk.module';
import { LangfuseModule } from './langfuse/langfuse.module';
import { UserActivityModule } from './user-activity/user-activity.module';
import { AgentsModule } from './agents/agents.module';
import { EventsModule } from './events/events.module';
import { ClientLogsModule } from './client-logs/client-logs.module';
import { ObjectRefinementModule } from './object-refinement/object-refinement.module';
import { ExternalSourcesModule } from './external-sources/external-sources.module';
import { UsersModule } from './users/users.module';
import { EmailModule } from './email/email.module';
import { ReleasesModule } from './releases/releases.module';
import { AppConfigService } from '../common/config/config.service';
import { entities } from '../entities';

@Module({
  imports: [
    // OpenTelemetry Module - provides @Span, @Traceable decorators and TraceService
    // Must be imported early to ensure proper context propagation
    OpenTelemetryModule.forRoot({
      metrics: {
        hostMetrics: true, // Collect host CPU, memory metrics
      },
    }),
    // TypeORM Configuration
    TypeOrmModule.forRootAsync({
      imports: [AppConfigModule],
      useFactory: (configService: AppConfigService) => ({
        type: 'postgres' as const,
        host: configService.dbHost,
        port: configService.dbPort,
        username: configService.dbUser,
        password: configService.dbPassword,
        database: configService.dbName,
        entities,
        synchronize: false, // NEVER true - always use migrations
        logging:
          process.env.NODE_ENV === 'development'
            ? ['error', 'warn', 'migration']
            : ['error'],
        autoLoadEntities: true,
        migrationsRun: process.env.SKIP_MIGRATIONS !== '1', // Respect SKIP_MIGRATIONS flag
        migrations: [__dirname + '/../migrations/*{.ts,.js}'],
        migrationsTableName: 'typeorm_migrations',
        // Pool configuration for optimal connection management
        // Reduces pg-pool.connect overhead by maintaining warm connections
        extra: {
          // Maximum connections in pool (default: 10)
          max: parseInt(process.env.DB_POOL_MAX || '20', 10),
          // Minimum connections to keep warm (default: 0)
          min: parseInt(process.env.DB_POOL_MIN || '5', 10),
          // How long idle connections stay in pool before being closed (30s)
          idleTimeoutMillis: parseInt(
            process.env.DB_POOL_IDLE_TIMEOUT || '30000',
            10
          ),
          // How long to wait for a connection from pool before erroring (5s)
          connectionTimeoutMillis: parseInt(
            process.env.DB_POOL_CONNECTION_TIMEOUT || '5000',
            10
          ),
        },
      }),
      inject: [AppConfigService],
    }),
    HealthModule,
    AuthModule,
    SettingsModule,
    OrgsModule,
    ProjectsModule,
    SearchModule,
    DocumentsModule,
    ChunksModule,
    IngestionModule,
    ChatModule,
    OpenApiModule,
    AppConfigModule,
    UtilsModule,
    EmbeddingsModule,
    InvitesModule,
    UserProfileModule,
    GraphModule,
    GraphSearchModule,
    UnifiedSearchModule,
    TemplatePackModule,
    TypeRegistryModule,
    ExtractionJobModule,
    DiscoveryJobModule,
    NotificationsModule,
    TasksModule,
    IntegrationsModule,
    ClickUpModule,
    McpModule,
    MonitoringModule,
    UserModule,
    ChatUiModule,
    ChatSdkModule,
    LangfuseModule,
    UserActivityModule,
    AgentsModule,
    EventsModule,
    ClientLogsModule,
    ObjectRefinementModule,
    ExternalSourcesModule,
    UsersModule,
    DatabaseModule,
    EmailModule,
    ReleasesModule,
  ],
})
export class AppModule {
  // Note: TracingMiddleware is now handled directly in main.ts as raw Express middleware
  // This ensures proper span creation BEFORE NestJS guards/interceptors
}

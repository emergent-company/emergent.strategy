import { Module } from '@nestjs/common';
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
import { TemplatePackModule } from './template-packs/template-pack.module';
import { TypeRegistryModule } from './type-registry/type-registry.module';
import { ExtractionJobModule } from './extraction-jobs/extraction-job.module';

@Module({
    imports: [
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
        TemplatePackModule,
        TypeRegistryModule,
        ExtractionJobModule,
        DatabaseModule,
    ],
})
export class AppModule { }


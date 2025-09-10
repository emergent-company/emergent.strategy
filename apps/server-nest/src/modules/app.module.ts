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
        DatabaseModule,
    ],
})
export class AppModule { }


import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { DatabaseModule } from '../../common/database/database.module';
import { UtilsModule } from '../../common/utils/utils.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { AuthModule } from '../auth/auth.module';
@Module({ imports: [DatabaseModule, UtilsModule, EmbeddingsModule, AuthModule], controllers: [IngestionController], providers: [IngestionService], exports: [IngestionService] })
export class IngestionModule { }


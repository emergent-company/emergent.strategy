import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { DatabaseModule } from '../../common/database/database.module';
import { UtilsModule } from '../../common/utils/utils.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { AuthModule } from '../auth/auth.module';
import { ExtractionJobModule } from '../extraction-jobs/extraction-job.module';
import { ChunksModule } from '../chunks/chunks.module';
import { Project } from '../../entities/project.entity';

@Module({
  imports: [
    DatabaseModule,
    UtilsModule,
    EmbeddingsModule,
    AuthModule,
    ExtractionJobModule,
    ChunksModule,
    TypeOrmModule.forFeature([Project]),
  ],
  controllers: [IngestionController],
  providers: [IngestionService],
  exports: [IngestionService],
})
export class IngestionModule {}

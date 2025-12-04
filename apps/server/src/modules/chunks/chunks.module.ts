import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChunksController } from './chunks.controller';
import { ChunksService } from './chunks.service';
import { ChunkEmbeddingJobsService } from './chunk-embedding-jobs.service';
import { ChunkEmbeddingWorkerService } from './chunk-embedding-worker.service';
import { DatabaseModule } from '../../common/database/database.module';
import { AppConfigModule } from '../../common/config/config.module';
import { AuthModule } from '../auth/auth.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { Chunk } from '../../entities/chunk.entity';
import { ChunkEmbeddingJob } from '../../entities/chunk-embedding-job.entity';
import { Document } from '../../entities/document.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Chunk, ChunkEmbeddingJob, Document]),
    DatabaseModule,
    AppConfigModule,
    AuthModule,
    EmbeddingsModule,
  ],
  controllers: [ChunksController],
  providers: [
    ChunksService,
    ChunkEmbeddingJobsService,
    ChunkEmbeddingWorkerService,
  ],
  exports: [ChunksService, ChunkEmbeddingJobsService],
})
export class ChunksModule {}

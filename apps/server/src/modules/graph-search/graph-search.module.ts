import { Module } from '@nestjs/common';
import { GraphSearchService } from './graph-search.service';
import { GraphSearchController } from './graph-search.controller';
import { GraphSearchRepository } from './graph-search.repository';
import { EmbeddingService } from './embedding.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [GraphSearchController],
  providers: [GraphSearchService, GraphSearchRepository, EmbeddingService],
  exports: [GraphSearchService],
})
export class GraphSearchModule {}

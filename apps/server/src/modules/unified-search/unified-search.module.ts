import { Module } from '@nestjs/common';
import { UnifiedSearchController } from './unified-search.controller';
import { UnifiedSearchService } from './unified-search.service';
import { GraphSearchModule } from '../graph-search/graph-search.module';
import { SearchModule } from '../search/search.module';
import { GraphModule } from '../graph/graph.module';
import { AuthModule } from '../auth/auth.module';

/**
 * Module for unified search combining graph objects and document chunks
 *
 * This module provides:
 * - Single endpoint for searching both graph objects and document chunks
 * - Multiple fusion strategies for combining results (weighted, RRF, interleave)
 * - Optional relationship expansion for graph results
 * - Parallel execution of graph and text searches for performance
 */
@Module({
  imports: [
    GraphSearchModule, // Provides GraphSearchService for graph object search
    SearchModule, // Provides SearchService for document chunk search
    GraphModule, // Provides GraphService for relationship expansion
    AuthModule, // Provides authentication and authorization guards
  ],
  controllers: [UnifiedSearchController],
  providers: [UnifiedSearchService],
  exports: [UnifiedSearchService],
})
export class UnifiedSearchModule {}

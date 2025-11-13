import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { PathSummaryService } from './path-summary.service';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { DatabaseModule } from '../../common/database/database.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [EmbeddingsModule, DatabaseModule, AuthModule],
  controllers: [SearchController],
  providers: [SearchService, PathSummaryService],
  exports: [SearchService, PathSummaryService],
})
export class SearchModule {}

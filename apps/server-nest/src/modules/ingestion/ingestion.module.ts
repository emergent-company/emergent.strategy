import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { DatabaseModule } from '../../common/database/database.module';
import { UtilsModule } from '../../common/utils/utils.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { AuthModule } from '../auth/auth.module';
import { ExtractionJobModule } from '../extraction-jobs/extraction-job.module';

@Module({
    imports: [
        DatabaseModule,
        UtilsModule,
        EmbeddingsModule,
        AuthModule,
        ExtractionJobModule,
    ],
    controllers: [IngestionController],
    providers: [IngestionService],
    exports: [IngestionService]
})
export class IngestionModule { }


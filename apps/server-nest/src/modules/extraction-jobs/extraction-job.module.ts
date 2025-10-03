import { Module } from '@nestjs/common';
import { ExtractionJobService } from './extraction-job.service';
import { ExtractionJobController } from './extraction-job.controller';
import { DatabaseModule } from '../../common/database/database.module';

/**
 * Extraction Job Module
 * 
 * Provides extraction job tracking and management
 * Phase 1: Basic CRUD operations for job lifecycle
 * Phase 2: Integration with Bull queue for async extraction workers
 */
@Module({
    imports: [DatabaseModule],
    providers: [ExtractionJobService],
    controllers: [ExtractionJobController],
    exports: [ExtractionJobService],
})
export class ExtractionJobModule { }

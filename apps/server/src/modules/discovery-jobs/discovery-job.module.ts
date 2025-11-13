import { Module } from '@nestjs/common';
import { DiscoveryJobService } from './discovery-job.service';
import { DiscoveryJobController } from './discovery-job.controller';
import { DiscoveryLLMProvider } from './discovery-llm.provider';
import { DatabaseModule } from '../../common/database/database.module';
import { AppConfigModule } from '../../common/config/config.module';
import { ExtractionJobModule } from '../extraction-jobs/extraction-job.module';

@Module({
  imports: [DatabaseModule, AppConfigModule, ExtractionJobModule],
  providers: [DiscoveryJobService, DiscoveryLLMProvider],
  controllers: [DiscoveryJobController],
  exports: [DiscoveryJobService],
})
export class DiscoveryJobModule {}

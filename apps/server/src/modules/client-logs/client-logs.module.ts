import { Module } from '@nestjs/common';
import { ClientLogsController } from './client-logs.controller';
import { ClientLogsService } from './client-logs.service';

/**
 * Module for handling browser client log submissions
 *
 * Provides an endpoint for the admin frontend to submit console
 * errors and warnings for server-side storage.
 */
@Module({
  controllers: [ClientLogsController],
  providers: [ClientLogsService],
  exports: [ClientLogsService],
})
export class ClientLogsModule {}

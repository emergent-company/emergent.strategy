import { Module, Global } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { AuthModule } from '../auth/auth.module';
import { HealthModule } from '../health/health.module';

/**
 * Global events module for real-time entity updates.
 *
 * This module provides:
 * - EventsService: For publishing entity events from any service
 * - EventsController: SSE endpoint at GET /api/events/stream
 * - Automatic heartbeat to keep connections alive
 *
 * Usage:
 * ```typescript
 * // In any service
 * constructor(private readonly eventsService: EventsService) {}
 *
 * // Emit an update
 * this.eventsService.emitUpdated('document', docId, projectId, { embeddedChunks: 5 });
 * ```
 */
@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      // Use wildcards for pattern matching (e.g., 'events.*')
      wildcard: true,
      // Delimiter for namespaced events
      delimiter: '.',
      // Don't throw on emit with no listeners
      ignoreErrors: false,
    }),
    AuthModule,
    HealthModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}

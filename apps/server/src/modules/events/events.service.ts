import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EntityEvent, EntityType } from './events.types';

/**
 * Service for publishing entity events to the event bus.
 * Events are project-scoped and delivered to all SSE connections for that project.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Emit an entity event to all subscribers for the given project
   */
  emit(event: EntityEvent): void {
    const channel = `events.${event.projectId}`;
    this.logger.debug(
      `Emitting ${event.type} for ${event.entity}:${event.id} on channel ${channel}`
    );
    this.eventEmitter.emit(channel, event);
  }

  /**
   * Emit an entity.created event
   */
  emitCreated(
    entity: EntityType,
    id: string,
    projectId: string,
    data?: Record<string, any>
  ): void {
    this.emit({
      type: 'entity.created',
      entity,
      id,
      projectId,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit an entity.updated event
   */
  emitUpdated(
    entity: EntityType,
    id: string,
    projectId: string,
    data?: Record<string, any>
  ): void {
    this.emit({
      type: 'entity.updated',
      entity,
      id,
      projectId,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit an entity.deleted event
   */
  emitDeleted(entity: EntityType, id: string, projectId: string): void {
    this.emit({
      type: 'entity.deleted',
      entity,
      id,
      projectId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit an entity.batch event for multiple entities
   */
  emitBatch(
    entity: EntityType,
    ids: string[],
    projectId: string,
    data?: Record<string, any>
  ): void {
    this.emit({
      type: 'entity.batch',
      entity,
      id: null,
      ids,
      projectId,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Subscribe to events for a specific project
   * Returns an unsubscribe function
   */
  subscribe(
    projectId: string,
    callback: (event: EntityEvent) => void
  ): () => void {
    const channel = `events.${projectId}`;
    this.eventEmitter.on(channel, callback);
    return () => {
      this.eventEmitter.off(channel, callback);
    };
  }

  /**
   * Subscribe to all events (for debugging)
   */
  subscribeAll(callback: (event: EntityEvent) => void): () => void {
    const handler = (event: EntityEvent) => callback(event);
    this.eventEmitter.on('events.*', handler);
    return () => {
      this.eventEmitter.off('events.*', handler);
    };
  }
}

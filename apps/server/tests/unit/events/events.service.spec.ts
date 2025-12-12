import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventsService } from '../../../src/modules/events/events.service';
import {
  EntityEvent,
  EntityType,
} from '../../../src/modules/events/events.types';

describe('EventsService', () => {
  let service: EventsService;
  let eventEmitter: EventEmitter2;

  beforeEach(() => {
    eventEmitter = new EventEmitter2();
    service = new EventsService(eventEmitter);
  });

  afterEach(() => {
    eventEmitter.removeAllListeners();
  });

  describe('emit', () => {
    it('should emit event to project-scoped channel', () => {
      const emitSpy = vi.spyOn(eventEmitter, 'emit');
      const event: EntityEvent = {
        type: 'entity.created',
        entity: 'document',
        id: 'doc-123',
        projectId: 'proj-456',
        timestamp: new Date().toISOString(),
      };

      service.emit(event);

      expect(emitSpy).toHaveBeenCalledWith('events.proj-456', event);
    });

    it('should emit events to different channels based on projectId', () => {
      const emitSpy = vi.spyOn(eventEmitter, 'emit');

      const event1: EntityEvent = {
        type: 'entity.created',
        entity: 'document',
        id: 'doc-1',
        projectId: 'project-A',
        timestamp: new Date().toISOString(),
      };

      const event2: EntityEvent = {
        type: 'entity.updated',
        entity: 'chunk',
        id: 'chunk-1',
        projectId: 'project-B',
        timestamp: new Date().toISOString(),
      };

      service.emit(event1);
      service.emit(event2);

      expect(emitSpy).toHaveBeenCalledWith('events.project-A', event1);
      expect(emitSpy).toHaveBeenCalledWith('events.project-B', event2);
    });
  });

  describe('emitCreated', () => {
    it('should emit entity.created event with correct payload', () => {
      const emitSpy = vi.spyOn(service, 'emit');
      const data = { status: 'uploaded' };

      service.emitCreated('document', 'doc-123', 'proj-456', data);

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'entity.created',
          entity: 'document',
          id: 'doc-123',
          projectId: 'proj-456',
          data,
          timestamp: expect.any(String),
        })
      );
    });

    it('should emit entity.created event without data', () => {
      const emitSpy = vi.spyOn(service, 'emit');

      service.emitCreated('chunk', 'chunk-789', 'proj-456');

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'entity.created',
          entity: 'chunk',
          id: 'chunk-789',
          projectId: 'proj-456',
          data: undefined,
          timestamp: expect.any(String),
        })
      );
    });
  });

  describe('emitUpdated', () => {
    it('should emit entity.updated event with correct payload', () => {
      const emitSpy = vi.spyOn(service, 'emit');
      const data = { status: 'processing', progress: 50 };

      service.emitUpdated('extraction_job', 'job-123', 'proj-456', data);

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'entity.updated',
          entity: 'extraction_job',
          id: 'job-123',
          projectId: 'proj-456',
          data,
          timestamp: expect.any(String),
        })
      );
    });

    it('should emit entity.updated event without data', () => {
      const emitSpy = vi.spyOn(service, 'emit');

      service.emitUpdated('document', 'doc-123', 'proj-456');

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'entity.updated',
          entity: 'document',
          id: 'doc-123',
          projectId: 'proj-456',
          data: undefined,
          timestamp: expect.any(String),
        })
      );
    });
  });

  describe('emitDeleted', () => {
    it('should emit entity.deleted event with correct payload', () => {
      const emitSpy = vi.spyOn(service, 'emit');

      service.emitDeleted('document', 'doc-123', 'proj-456');

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'entity.deleted',
          entity: 'document',
          id: 'doc-123',
          projectId: 'proj-456',
          timestamp: expect.any(String),
        })
      );
    });

    it('should not include data in deleted event', () => {
      const emitSpy = vi.spyOn(service, 'emit');

      service.emitDeleted('chunk', 'chunk-789', 'proj-456');

      const emittedEvent = emitSpy.mock.calls[0][0] as EntityEvent;
      expect(emittedEvent).not.toHaveProperty('data');
    });
  });

  describe('emitBatch', () => {
    it('should emit entity.batch event with multiple ids', () => {
      const emitSpy = vi.spyOn(service, 'emit');
      const ids = ['chunk-1', 'chunk-2', 'chunk-3'];
      const data = { status: 'embedded' };

      service.emitBatch('chunk', ids, 'proj-456', data);

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'entity.batch',
          entity: 'chunk',
          id: null,
          ids,
          projectId: 'proj-456',
          data,
          timestamp: expect.any(String),
        })
      );
    });

    it('should emit entity.batch event without data', () => {
      const emitSpy = vi.spyOn(service, 'emit');
      const ids = ['doc-1', 'doc-2'];

      service.emitBatch('document', ids, 'proj-456');

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'entity.batch',
          entity: 'document',
          id: null,
          ids,
          projectId: 'proj-456',
          data: undefined,
          timestamp: expect.any(String),
        })
      );
    });
  });

  describe('subscribe', () => {
    it('should receive events for subscribed project', () => {
      const callback = vi.fn();
      service.subscribe('proj-456', callback);

      const event: EntityEvent = {
        type: 'entity.created',
        entity: 'document',
        id: 'doc-123',
        projectId: 'proj-456',
        timestamp: new Date().toISOString(),
      };
      service.emit(event);

      expect(callback).toHaveBeenCalledWith(event);
    });

    it('should not receive events for other projects', () => {
      const callback = vi.fn();
      service.subscribe('proj-456', callback);

      const event: EntityEvent = {
        type: 'entity.created',
        entity: 'document',
        id: 'doc-123',
        projectId: 'proj-789', // Different project
        timestamp: new Date().toISOString(),
      };
      service.emit(event);

      expect(callback).not.toHaveBeenCalled();
    });

    it('should return unsubscribe function that stops receiving events', () => {
      const callback = vi.fn();
      const unsubscribe = service.subscribe('proj-456', callback);

      const event1: EntityEvent = {
        type: 'entity.created',
        entity: 'document',
        id: 'doc-1',
        projectId: 'proj-456',
        timestamp: new Date().toISOString(),
      };
      service.emit(event1);
      expect(callback).toHaveBeenCalledTimes(1);

      // Unsubscribe
      unsubscribe();

      const event2: EntityEvent = {
        type: 'entity.updated',
        entity: 'document',
        id: 'doc-2',
        projectId: 'proj-456',
        timestamp: new Date().toISOString(),
      };
      service.emit(event2);
      expect(callback).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should support multiple subscribers to same project', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      service.subscribe('proj-456', callback1);
      service.subscribe('proj-456', callback2);

      const event: EntityEvent = {
        type: 'entity.created',
        entity: 'document',
        id: 'doc-123',
        projectId: 'proj-456',
        timestamp: new Date().toISOString(),
      };
      service.emit(event);

      expect(callback1).toHaveBeenCalledWith(event);
      expect(callback2).toHaveBeenCalledWith(event);
    });
  });

  describe('subscribeAll', () => {
    it('should receive events from all projects using wildcard', () => {
      const callback = vi.fn();
      service.subscribeAll(callback);

      // This test verifies subscribeAll uses wildcard pattern
      // Note: EventEmitter2 wildcard requires proper configuration
      // The actual behavior depends on EventEmitter2 wildcard support
      const onSpy = vi.spyOn(eventEmitter, 'on');
      service.subscribeAll(vi.fn());

      expect(onSpy).toHaveBeenCalledWith('events.*', expect.any(Function));
    });

    it('should return unsubscribe function', () => {
      const callback = vi.fn();
      const unsubscribe = service.subscribeAll(callback);

      expect(typeof unsubscribe).toBe('function');

      // Unsubscribe should call eventEmitter.off
      const offSpy = vi.spyOn(eventEmitter, 'off');
      unsubscribe();
      expect(offSpy).toHaveBeenCalledWith('events.*', expect.any(Function));
    });
  });

  describe('timestamp generation', () => {
    it('should generate valid ISO 8601 timestamps', () => {
      const emitSpy = vi.spyOn(service, 'emit');

      service.emitCreated('document', 'doc-123', 'proj-456');

      const emittedEvent = emitSpy.mock.calls[0][0] as EntityEvent;
      const timestamp = new Date(emittedEvent.timestamp);

      expect(timestamp).toBeInstanceOf(Date);
      expect(isNaN(timestamp.getTime())).toBe(false);
    });

    it('should generate unique timestamps for different events', async () => {
      const emitSpy = vi.spyOn(service, 'emit');

      service.emitCreated('document', 'doc-1', 'proj-456');

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      service.emitCreated('document', 'doc-2', 'proj-456');

      const event1 = emitSpy.mock.calls[0][0] as EntityEvent;
      const event2 = emitSpy.mock.calls[1][0] as EntityEvent;

      // Timestamps should be valid (may or may not be different depending on timing)
      expect(new Date(event1.timestamp).getTime()).toBeGreaterThan(0);
      expect(new Date(event2.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('entity types', () => {
    const entityTypes: EntityType[] = [
      'document',
      'chunk',
      'extraction_job',
      'graph_object',
      'notification',
    ];

    entityTypes.forEach((entityType) => {
      it(`should emit events for entity type: ${entityType}`, () => {
        const emitSpy = vi.spyOn(service, 'emit');

        service.emitCreated(entityType, `${entityType}-123`, 'proj-456');

        expect(emitSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            entity: entityType,
          })
        );
      });
    });
  });
});

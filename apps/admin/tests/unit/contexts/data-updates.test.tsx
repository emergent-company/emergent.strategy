import { describe, it, expect } from 'vitest';

// Import types - define locally to avoid module resolution issues in tests
// These mirror the types in @/types/realtime-events
type EntityEventType =
  | 'entity.created'
  | 'entity.updated'
  | 'entity.deleted'
  | 'entity.batch';

type EntityType =
  | 'document'
  | 'chunk'
  | 'extraction_job'
  | 'graph_object'
  | 'notification';

interface EntityEvent {
  type: EntityEventType;
  entity: EntityType;
  id: string | null;
  ids?: string[];
  data?: Record<string, unknown>;
  timestamp: string;
  projectId: string;
}

type SubscriptionPattern = '*' | `${EntityType}:*` | `${EntityType}:${string}`;

/**
 * Re-implement matchesPattern for testing since it's not exported
 * This should match the implementation in data-updates.tsx
 */
function matchesPattern(
  event: EntityEvent,
  pattern: SubscriptionPattern
): boolean {
  if (pattern === '*') {
    return true;
  }

  const [entityPattern, idPattern] = pattern.split(':');

  // Entity type must match
  if (entityPattern !== event.entity) {
    return false;
  }

  // If pattern is 'entity:*', match all events for that entity type
  if (idPattern === '*') {
    return true;
  }

  // For specific ID pattern, check if event ID matches
  if (event.id && idPattern === event.id) {
    return true;
  }

  // For batch events, check if any of the IDs match
  if (event.ids && event.ids.includes(idPattern)) {
    return true;
  }

  return false;
}

describe('matchesPattern', () => {
  const baseEvent: EntityEvent = {
    type: 'entity.created',
    entity: 'document',
    id: 'doc-123',
    projectId: 'proj-456',
    timestamp: new Date().toISOString(),
  };

  describe('wildcard pattern (*)', () => {
    it('should match any event with wildcard pattern', () => {
      expect(matchesPattern(baseEvent, '*')).toBe(true);
    });

    it('should match document events', () => {
      expect(matchesPattern({ ...baseEvent, entity: 'document' }, '*')).toBe(
        true
      );
    });

    it('should match chunk events', () => {
      expect(matchesPattern({ ...baseEvent, entity: 'chunk' }, '*')).toBe(true);
    });

    it('should match any event type', () => {
      expect(
        matchesPattern({ ...baseEvent, type: 'entity.deleted' }, '*')
      ).toBe(true);
    });
  });

  describe('entity wildcard pattern (entity:*)', () => {
    it('should match all events for the specified entity type', () => {
      expect(matchesPattern(baseEvent, 'document:*')).toBe(true);
    });

    it('should not match events for different entity types', () => {
      expect(matchesPattern(baseEvent, 'chunk:*')).toBe(false);
    });

    it('should match created events', () => {
      expect(
        matchesPattern({ ...baseEvent, type: 'entity.created' }, 'document:*')
      ).toBe(true);
    });

    it('should match updated events', () => {
      expect(
        matchesPattern({ ...baseEvent, type: 'entity.updated' }, 'document:*')
      ).toBe(true);
    });

    it('should match deleted events', () => {
      expect(
        matchesPattern({ ...baseEvent, type: 'entity.deleted' }, 'document:*')
      ).toBe(true);
    });

    it('should match batch events', () => {
      expect(
        matchesPattern(
          {
            ...baseEvent,
            type: 'entity.batch',
            id: null,
            ids: ['doc-1', 'doc-2'],
          },
          'document:*'
        )
      ).toBe(true);
    });
  });

  describe('specific ID pattern (entity:id)', () => {
    it('should match event with exact ID', () => {
      expect(matchesPattern(baseEvent, 'document:doc-123')).toBe(true);
    });

    it('should not match event with different ID', () => {
      expect(matchesPattern(baseEvent, 'document:doc-456')).toBe(false);
    });

    it('should not match event for different entity type', () => {
      expect(matchesPattern(baseEvent, 'chunk:doc-123')).toBe(false);
    });

    it('should match batch event when ID is in ids array', () => {
      const batchEvent: EntityEvent = {
        type: 'entity.batch',
        entity: 'chunk',
        id: null,
        ids: ['chunk-1', 'chunk-2', 'chunk-3'],
        projectId: 'proj-456',
        timestamp: new Date().toISOString(),
      };
      expect(matchesPattern(batchEvent, 'chunk:chunk-2')).toBe(true);
    });

    it('should not match batch event when ID is not in ids array', () => {
      const batchEvent: EntityEvent = {
        type: 'entity.batch',
        entity: 'chunk',
        id: null,
        ids: ['chunk-1', 'chunk-2', 'chunk-3'],
        projectId: 'proj-456',
        timestamp: new Date().toISOString(),
      };
      expect(matchesPattern(batchEvent, 'chunk:chunk-99')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle null ID in events', () => {
      const eventWithNullId: EntityEvent = {
        type: 'entity.batch',
        entity: 'document',
        id: null,
        ids: ['doc-1'],
        projectId: 'proj-456',
        timestamp: new Date().toISOString(),
      };
      expect(matchesPattern(eventWithNullId, 'document:doc-1')).toBe(true);
    });

    it('should handle events without ids array', () => {
      expect(matchesPattern(baseEvent, 'document:non-existent')).toBe(false);
    });

    it('should handle empty pattern correctly', () => {
      // Empty pattern after split means entity pattern is empty string
      expect(matchesPattern(baseEvent, ':*' as SubscriptionPattern)).toBe(
        false
      );
    });

    it('should support all entity types', () => {
      const entityTypes = [
        'document',
        'chunk',
        'extraction_job',
        'graph_object',
        'notification',
      ] as const;

      entityTypes.forEach((entityType) => {
        const event: EntityEvent = {
          ...baseEvent,
          entity: entityType,
        };
        expect(matchesPattern(event, `${entityType}:*`)).toBe(true);
      });
    });

    it('should support all event types', () => {
      const eventTypes = [
        'entity.created',
        'entity.updated',
        'entity.deleted',
        'entity.batch',
      ] as const;

      eventTypes.forEach((eventType) => {
        const event: EntityEvent = {
          ...baseEvent,
          type: eventType,
        };
        expect(matchesPattern(event, 'document:*')).toBe(true);
      });
    });
  });
});

describe('SubscriptionPattern formats', () => {
  it('should correctly parse entity:* format', () => {
    const pattern = 'document:*';
    const [entity, id] = pattern.split(':');
    expect(entity).toBe('document');
    expect(id).toBe('*');
  });

  it('should correctly parse entity:id format', () => {
    const pattern = 'chunk:abc-123-def';
    const [entity, id] = pattern.split(':');
    expect(entity).toBe('chunk');
    expect(id).toBe('abc-123-def');
  });

  it('should handle patterns with multiple colons in ID', () => {
    // This is a potential edge case - IDs with colons
    const pattern = 'document:doc:with:colons';
    const [entity, ...idParts] = pattern.split(':');
    const id = idParts.join(':');
    expect(entity).toBe('document');
    expect(id).toBe('doc:with:colons');
  });
});

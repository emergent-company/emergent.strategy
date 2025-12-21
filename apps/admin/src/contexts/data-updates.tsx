import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useFetchSSE } from '@/hooks/use-fetch-sse';
import { useConfig } from './config';
import { useAuth } from './useAuth';
import type {
  ConnectionState,
  DataUpdatesContextValue,
  EntityEvent,
  EntityEventHandler,
  SubscriptionPattern,
  ConnectedEvent,
  HeartbeatEvent,
  HealthStatus,
} from '@/types/realtime-events';

/**
 * Check if an event matches a subscription pattern
 *
 * Pattern formats:
 * - '*' - matches all events
 * - 'entity:*' - matches all events for a specific entity type (e.g., 'document:*')
 * - 'entity:id' - matches events for a specific entity instance (e.g., 'document:abc123')
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

type Subscription = {
  pattern: SubscriptionPattern;
  handler: EntityEventHandler;
};

const DataUpdatesContext = createContext<DataUpdatesContextValue | undefined>(
  undefined
);

export const DataUpdatesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { config } = useConfig();
  const { getAccessToken, isAuthenticated } = useAuth();
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [healthData, setHealthData] = useState<HealthStatus | null>(null);
  const [lastHealthUpdate, setLastHealthUpdate] = useState<Date | null>(null);
  const subscriptionsRef = useRef<Map<symbol, Subscription>>(new Map());

  // Build SSE URL with project ID (token is sent in header now)
  const sseUrl = useMemo(() => {
    const projectId = config.activeProjectId;
    const token = getAccessToken();

    // Only connect if we have both a project and valid authentication
    if (!projectId || !token || !isAuthenticated) {
      return null;
    }

    // Get the API base URL from environment or use default
    // Use VITE_API_BASE for consistency with other API calls
    const apiBase = (import.meta as any).env?.VITE_API_BASE || '';

    // Construct SSE URL with only projectId - token is sent via Authorization header
    // Must use /api/ prefix to go through Vite proxy in development
    return `${apiBase}/api/events/stream?projectId=${projectId}`;
  }, [config.activeProjectId, getAccessToken, isAuthenticated]);

  // Get current token for the SSE connection
  const token = useMemo(() => getAccessToken(), [getAccessToken]);

  // Handle incoming SSE messages (now receives event type and data separately)
  const handleMessage = useCallback((eventType: string, data: string) => {
    try {
      const parsed = JSON.parse(data);

      // Handle different event types based on SSE event field
      if (eventType === 'connected') {
        const connectedEvent = parsed as ConnectedEvent;
        setConnectionId(connectedEvent.connectionId);
        console.debug('[DataUpdates] Connected:', connectedEvent.connectionId);
        return;
      }

      if (eventType === 'heartbeat') {
        // Extract health data from heartbeat if present
        const heartbeatEvent = parsed as HeartbeatEvent;
        if (heartbeatEvent.health) {
          setHealthData(heartbeatEvent.health);
          setLastHealthUpdate(new Date());
        }
        return;
      }

      // Entity events - distribute to subscribers
      // The event type comes from SSE event name, not from the data payload
      // Server sends: event: entity.updated\ndata: {entity, id, data, timestamp}
      const isEntityEvent =
        eventType === 'entity.created' ||
        eventType === 'entity.updated' ||
        eventType === 'entity.deleted' ||
        eventType === 'entity.batch';

      if (isEntityEvent) {
        // Reconstruct the full EntityEvent by adding the type from SSE event name
        const entityEvent: EntityEvent = {
          ...parsed,
          type: eventType as EntityEvent['type'],
        };

        console.debug(
          '[DataUpdates] Event received:',
          entityEvent.type,
          entityEvent.entity,
          entityEvent.id
        );

        // Distribute to matching subscribers
        subscriptionsRef.current.forEach((subscription) => {
          if (matchesPattern(entityEvent, subscription.pattern)) {
            try {
              subscription.handler(entityEvent);
            } catch (err) {
              console.error('[DataUpdates] Subscriber error:', err);
            }
          }
        });
      }
    } catch (err) {
      console.error('[DataUpdates] Failed to parse SSE message:', err, data);
    }
  }, []);

  // Handle SSE errors
  const handleError = useCallback((err: Error) => {
    console.warn('[DataUpdates] SSE error:', err.message);
    setConnectionId(null);
  }, []);

  // Handle SSE open
  const handleOpen = useCallback(() => {
    console.debug('[DataUpdates] SSE connection opened');
  }, []);

  // Use the fetch-based SSE hook (supports Authorization header)
  const { connectionState, reconnect } = useFetchSSE(sseUrl, {
    onMessage: handleMessage,
    onError: handleError,
    onOpen: handleOpen,
    token: token ?? undefined,
    autoReconnect: true,
    maxReconnectAttempts: 10,
    initialReconnectDelay: 1000,
    maxReconnectDelay: 30000,
  });

  // Reset connection ID when disconnected
  useEffect(() => {
    if (connectionState === 'disconnected' || connectionState === 'error') {
      setConnectionId(null);
    }
  }, [connectionState]);

  // Subscribe function - returns unsubscribe function
  const subscribe = useCallback(
    (
      pattern: SubscriptionPattern,
      handler: EntityEventHandler
    ): (() => void) => {
      const key = Symbol('subscription');
      subscriptionsRef.current.set(key, { pattern, handler });

      console.debug('[DataUpdates] Subscribed to pattern:', pattern);

      // Return unsubscribe function
      return () => {
        subscriptionsRef.current.delete(key);
        console.debug('[DataUpdates] Unsubscribed from pattern:', pattern);
      };
    },
    []
  );

  // Context value
  const value = useMemo<DataUpdatesContextValue>(
    () => ({
      connectionState,
      connectionId,
      subscribe,
      reconnect,
      healthData,
      lastHealthUpdate,
    }),
    [
      connectionState,
      connectionId,
      subscribe,
      reconnect,
      healthData,
      lastHealthUpdate,
    ]
  );

  return (
    <DataUpdatesContext.Provider value={value}>
      {children}
    </DataUpdatesContext.Provider>
  );
};

/**
 * Hook to access the DataUpdates context
 */
export function useDataUpdatesContext(): DataUpdatesContextValue {
  const context = useContext(DataUpdatesContext);
  if (!context) {
    throw new Error(
      'useDataUpdatesContext must be used within a DataUpdatesProvider'
    );
  }
  return context;
}

/**
 * Hook to subscribe to real-time entity updates
 *
 * @param pattern - Subscription pattern (e.g., 'document:*', 'chunk:abc123', '*')
 * @param handler - Callback function to handle matching events
 * @param deps - Optional dependency array for the handler (similar to useCallback deps)
 *
 * @example
 * // Subscribe to all document events
 * useDataUpdates('document:*', (event) => {
 *   console.log('Document event:', event);
 *   refetch(); // Refresh data
 * });
 *
 * @example
 * // Subscribe to a specific chunk
 * useDataUpdates(`chunk:${chunkId}`, (event) => {
 *   if (event.type === 'entity.updated') {
 *     setChunk(prev => ({ ...prev, ...event.data }));
 *   }
 * }, [chunkId]);
 */
export function useDataUpdates(
  pattern: SubscriptionPattern,
  handler: EntityEventHandler,
  deps: React.DependencyList = []
): { connectionState: ConnectionState; reconnect: () => void } {
  const { subscribe, connectionState, reconnect } = useDataUpdatesContext();

  // Memoize handler to prevent unnecessary re-subscriptions
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoizedHandler = useCallback(handler, deps);

  useEffect(() => {
    const unsubscribe = subscribe(pattern, memoizedHandler);
    return unsubscribe;
  }, [pattern, memoizedHandler, subscribe]);

  return { connectionState, reconnect };
}

/**
 * Hook to get just the connection state (for indicators, etc.)
 */
export function useDataUpdatesConnection(): {
  connectionState: ConnectionState;
  connectionId: string | null;
  reconnect: () => void;
} {
  const { connectionState, connectionId, reconnect } = useDataUpdatesContext();
  return { connectionState, connectionId, reconnect };
}

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ConnectionState } from '../types/realtime-events';

type SSEOptions = {
  onMessage: (data: string) => void;
  onError?: (err: Event) => void;
  onOpen?: () => void;
  /** Enable auto-reconnect with exponential backoff (default: true) */
  autoReconnect?: boolean;
  /** Maximum reconnect attempts (default: 10) */
  maxReconnectAttempts?: number;
  /** Initial reconnect delay in ms (default: 1000) */
  initialReconnectDelay?: number;
  /** Maximum reconnect delay in ms (default: 30000) */
  maxReconnectDelay?: number;
};

interface SSEReturn {
  /** Close the connection */
  close: () => void;
  /** Manually reconnect */
  reconnect: () => void;
  /** Current connection state */
  connectionState: ConnectionState;
  /** Current EventSource instance */
  current: EventSource | null;
}

/**
 * Enhanced SSE hook with reconnection logic and connection state tracking
 */
export function useSSE(url: string | null, opts: SSEOptions): SSEReturn {
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isClosedManuallyRef = useRef(false);

  const [connectionState, setConnectionState] = useState<ConnectionState>(
    url ? 'connecting' : 'disconnected'
  );

  const {
    onMessage,
    onError,
    onOpen,
    autoReconnect = true,
    maxReconnectAttempts = 10,
    initialReconnectDelay = 1000,
    maxReconnectDelay = 30000,
  } = opts;

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!url) {
      setConnectionState('disconnected');
      return;
    }

    // Close existing connection if any
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }

    setConnectionState('connecting');
    isClosedManuallyRef.current = false;

    const es = new EventSource(url, { withCredentials: true });
    sourceRef.current = es;

    es.onopen = () => {
      setConnectionState('connected');
      reconnectAttemptRef.current = 0;
      onOpen?.();
    };

    es.onmessage = (ev) => {
      onMessage(ev.data);
    };

    es.onerror = (ev) => {
      onError?.(ev);

      // EventSource automatically attempts to reconnect on errors,
      // but if it closes, we need to handle reconnection ourselves
      if (es.readyState === EventSource.CLOSED) {
        setConnectionState('error');
        sourceRef.current = null;

        // Attempt reconnection if not manually closed
        if (
          autoReconnect &&
          !isClosedManuallyRef.current &&
          reconnectAttemptRef.current < maxReconnectAttempts
        ) {
          const delay = Math.min(
            initialReconnectDelay * Math.pow(2, reconnectAttemptRef.current),
            maxReconnectDelay
          );

          reconnectAttemptRef.current += 1;

          console.debug(
            `[SSE] Connection lost. Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current}/${maxReconnectAttempts})`
          );

          clearReconnectTimeout();
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else if (reconnectAttemptRef.current >= maxReconnectAttempts) {
          console.warn('[SSE] Max reconnect attempts reached. Giving up.');
          setConnectionState('error');
        }
      }
    };
  }, [
    url,
    onMessage,
    onError,
    onOpen,
    autoReconnect,
    maxReconnectAttempts,
    initialReconnectDelay,
    maxReconnectDelay,
    clearReconnectTimeout,
  ]);

  const close = useCallback(() => {
    isClosedManuallyRef.current = true;
    clearReconnectTimeout();
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
    }
    setConnectionState('disconnected');
  }, [clearReconnectTimeout]);

  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      isClosedManuallyRef.current = true;
      clearReconnectTimeout();
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    };
  }, [connect, clearReconnectTimeout]);

  return {
    close,
    reconnect,
    connectionState,
    get current() {
      return sourceRef.current;
    },
  };
}

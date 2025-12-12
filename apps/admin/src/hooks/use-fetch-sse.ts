import { useEffect, useRef, useState, useCallback } from 'react';
import type { ConnectionState } from '../types/realtime-events';

type FetchSSEOptions = {
  /** Handler for each SSE message (receives the data field content) */
  onMessage: (event: string, data: string) => void;
  /** Handler for errors */
  onError?: (err: Error) => void;
  /** Handler when connection is established */
  onOpen?: () => void;
  /** Authorization token (will be sent as Bearer token in header) */
  token?: string;
  /** Additional headers to send with the request */
  headers?: Record<string, string>;
  /** Enable auto-reconnect with exponential backoff (default: true) */
  autoReconnect?: boolean;
  /** Maximum reconnect attempts (default: 10) */
  maxReconnectAttempts?: number;
  /** Initial reconnect delay in ms (default: 1000) */
  initialReconnectDelay?: number;
  /** Maximum reconnect delay in ms (default: 30000) */
  maxReconnectDelay?: number;
};

interface FetchSSEReturn {
  /** Close the connection */
  close: () => void;
  /** Manually reconnect */
  reconnect: () => void;
  /** Current connection state */
  connectionState: ConnectionState;
}

/**
 * Parse SSE format from a text chunk.
 * SSE format: "event: <type>\ndata: <json>\n\n"
 */
function parseSSEEvents(buffer: string): {
  events: Array<{ event: string; data: string }>;
  remainder: string;
} {
  const events: Array<{ event: string; data: string }> = [];
  const lines = buffer.split('\n');

  let currentEvent = 'message';
  let currentData = '';
  let remainder = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this might be an incomplete line at the end
    if (i === lines.length - 1 && line !== '') {
      remainder = line;
      break;
    }

    if (line.startsWith('event:')) {
      currentEvent = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      currentData = line.slice(5).trim();
    } else if (line === '' && currentData) {
      // Empty line signals end of event
      events.push({ event: currentEvent, data: currentData });
      currentEvent = 'message';
      currentData = '';
    }
  }

  return { events, remainder };
}

/**
 * SSE hook using fetch() with ReadableStream.
 * Supports custom headers including Authorization, unlike EventSource.
 */
export function useFetchSSE(
  url: string | null,
  opts: FetchSSEOptions
): FetchSSEReturn {
  const abortControllerRef = useRef<AbortController | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isClosedManuallyRef = useRef(false);

  // Store callbacks in refs to avoid dependency issues
  const onMessageRef = useRef(opts.onMessage);
  const onErrorRef = useRef(opts.onError);
  const onOpenRef = useRef(opts.onOpen);

  // Update refs when callbacks change
  useEffect(() => {
    onMessageRef.current = opts.onMessage;
  }, [opts.onMessage]);

  useEffect(() => {
    onErrorRef.current = opts.onError;
  }, [opts.onError]);

  useEffect(() => {
    onOpenRef.current = opts.onOpen;
  }, [opts.onOpen]);

  const [connectionState, setConnectionState] = useState<ConnectionState>(
    url ? 'connecting' : 'disconnected'
  );

  // Extract stable values from options
  const {
    token,
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

  // Use a ref for the connect function to break circular dependency
  const connectRef = useRef<(() => Promise<void>) | null>(null);

  const scheduleReconnect = useCallback(() => {
    if (
      !autoReconnect ||
      isClosedManuallyRef.current ||
      reconnectAttemptRef.current >= maxReconnectAttempts
    ) {
      if (reconnectAttemptRef.current >= maxReconnectAttempts) {
        console.warn('[FetchSSE] Max reconnect attempts reached. Giving up.');
      }
      setConnectionState('error');
      return;
    }

    const delay = Math.min(
      initialReconnectDelay * Math.pow(2, reconnectAttemptRef.current),
      maxReconnectDelay
    );

    reconnectAttemptRef.current += 1;

    console.debug(
      `[FetchSSE] Connection lost. Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current}/${maxReconnectAttempts})`
    );

    clearReconnectTimeout();
    reconnectTimeoutRef.current = setTimeout(() => {
      connectRef.current?.();
    }, delay);
  }, [
    autoReconnect,
    maxReconnectAttempts,
    initialReconnectDelay,
    maxReconnectDelay,
    clearReconnectTimeout,
  ]);

  const connect = useCallback(async () => {
    if (!url) {
      setConnectionState('disconnected');
      return;
    }

    // Abort existing connection if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    setConnectionState('connecting');
    isClosedManuallyRef.current = false;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Build headers with Authorization
      const headers: Record<string, string> = {
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'include',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `SSE connection failed: ${response.status} ${response.statusText}`
        );
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Connection established
      setConnectionState('connected');
      reconnectAttemptRef.current = 0;
      onOpenRef.current?.();

      // Read the stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.debug('[FetchSSE] Stream ended');
          break;
        }

        // Decode chunk and append to buffer
        buffer += decoder.decode(value, { stream: true });

        // Parse complete events from buffer
        const { events, remainder } = parseSSEEvents(buffer);
        buffer = remainder;

        // Dispatch events
        for (const { event, data } of events) {
          try {
            onMessageRef.current(event, data);
          } catch (err) {
            console.error('[FetchSSE] Error in message handler:', err);
          }
        }
      }

      // Stream ended - attempt reconnect if not manually closed
      if (!isClosedManuallyRef.current) {
        scheduleReconnect();
      }
    } catch (err) {
      // Ignore abort errors (expected when closing)
      if (err instanceof Error && err.name === 'AbortError') {
        console.debug('[FetchSSE] Connection aborted');
        return;
      }

      console.error('[FetchSSE] Connection error:', err);
      onErrorRef.current?.(err instanceof Error ? err : new Error(String(err)));
      setConnectionState('error');

      // Attempt reconnect
      if (!isClosedManuallyRef.current) {
        scheduleReconnect();
      }
    }
  }, [url, token, scheduleReconnect]);

  // Update the connect ref
  connectRef.current = connect;

  const close = useCallback(() => {
    isClosedManuallyRef.current = true;
    clearReconnectTimeout();
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setConnectionState('disconnected');
  }, [clearReconnectTimeout]);

  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0;
    connect();
  }, [connect]);

  // Only reconnect when url or token changes
  useEffect(() => {
    connect();

    return () => {
      isClosedManuallyRef.current = true;
      clearReconnectTimeout();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [url, token]); // Only depend on url and token, not connect

  return {
    close,
    reconnect,
    connectionState,
  };
}

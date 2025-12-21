import { useCallback, useEffect, useRef, useState } from 'react';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';
import type {
  RefinementConversation,
  RefinementMessage,
  RefinementSuggestion,
  RefinementStreamEvent,
  ApplySuggestionResult,
  SuggestionStatus,
} from '@/types/object-refinement';

function uid(prefix = 'msg'): string {
  return `${prefix}_${Math.random()
    .toString(36)
    .slice(2, 10)}${Date.now().toString(36)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export interface UseObjectRefinementChatOptions {
  /**
   * The object ID to chat about
   */
  objectId: string;

  /**
   * Callback when object data may have changed (after applying suggestion)
   */
  onObjectUpdated?: (newVersion: number) => void;

  /**
   * Polling interval for checking new messages (ms). Set to 0 to disable.
   * Default: 5000 (5 seconds)
   */
  pollInterval?: number;
}

export interface UseObjectRefinementChatReturn {
  // State
  conversation: RefinementConversation | null;
  messages: RefinementMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  objectVersion: number | null;

  // Actions
  send: (content: string) => Promise<void>;
  stop: () => void;
  applySuggestion: (
    messageId: string,
    suggestionIndex: number
  ) => Promise<ApplySuggestionResult>;
  rejectSuggestion: (
    messageId: string,
    suggestionIndex: number,
    reason?: string
  ) => Promise<{ success: boolean; error?: string }>;
  refresh: () => Promise<void>;
}

/**
 * Hook for managing object refinement chat functionality.
 *
 * Provides streaming chat with the AI assistant to refine graph object data,
 * including applying and rejecting suggestions.
 */
export function useObjectRefinementChat(
  options: UseObjectRefinementChatOptions
): UseObjectRefinementChatReturn {
  const { objectId, onObjectUpdated, pollInterval = 5000 } = options;

  const {
    config: { activeProjectId },
  } = useConfig();
  const { apiBase, buildHeaders, fetchJson } = useApi();

  // State
  const [conversation, setConversation] =
    useState<RefinementConversation | null>(null);
  const [messages, setMessages] = useState<RefinementMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [objectVersion, setObjectVersion] = useState<number | null>(null);

  // Refs for streaming control
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Load or create conversation for this object
   */
  const loadConversation = useCallback(async () => {
    if (!objectId || !activeProjectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const url = `${apiBase}/api/objects/${objectId}/refinement-chat`;
      const result = await fetchJson<{
        conversation: RefinementConversation;
        messages: RefinementMessage[];
        objectVersion: number;
      }>(url);

      setConversation(result.conversation);
      setMessages(result.messages || []);
      // Set objectVersion from server response for apply/reject functionality
      if (typeof result.objectVersion === 'number') {
        setObjectVersion(result.objectVersion);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to load conversation';
      setError(msg);
      console.error('[useObjectRefinementChat] loadConversation error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [objectId, activeProjectId, apiBase, fetchJson]);

  /**
   * Send a message and stream the response
   */
  const send = useCallback(
    async (content: string) => {
      if (!objectId || !activeProjectId || !content.trim()) return;

      // Abort any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      setIsStreaming(true);
      setError(null);

      // Optimistically add user message
      const userMsgId = uid('msg');
      const userMessage: RefinementMessage = {
        id: userMsgId,
        role: 'user',
        content: content.trim(),
        createdAt: nowIso(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Create placeholder for assistant response
      const assistantMsgId = uid('msg');
      streamingMessageIdRef.current = assistantMsgId;
      const assistantMessage: RefinementMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        createdAt: nowIso(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      abortControllerRef.current = new AbortController();

      try {
        const url = `${apiBase}/api/objects/${objectId}/refinement-chat`;
        const response = await fetch(url, {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify({ content: content.trim() }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(
            errorBody.error?.message || `HTTP ${response.status}`
          );
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        // Process SSE stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedContent = '';
        let receivedSuggestions: RefinementSuggestion[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6).trim();
            if (!json) continue;

            try {
              const event = JSON.parse(json) as RefinementStreamEvent;

              switch (event.type) {
                case 'meta':
                  if (event.conversationId && !conversation?.id) {
                    setConversation((prev) =>
                      prev ? { ...prev, id: event.conversationId } : null
                    );
                  }
                  if (typeof event.objectVersion === 'number') {
                    setObjectVersion(event.objectVersion);
                  }
                  if (event.generation_error) {
                    console.warn(
                      '[useObjectRefinementChat] Generation error:',
                      event.generation_error
                    );
                  }
                  break;

                case 'token':
                  if (event.token) {
                    accumulatedContent += event.token;
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMsgId
                          ? { ...m, content: accumulatedContent }
                          : m
                      )
                    );
                  }
                  break;

                case 'suggestions':
                  if (event.suggestions && Array.isArray(event.suggestions)) {
                    receivedSuggestions = event.suggestions.map((s, idx) => ({
                      index: idx,
                      type: s.type,
                      explanation: s.explanation || '',
                      details: s,
                      status: 'pending' as SuggestionStatus,
                    }));
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMsgId
                          ? { ...m, suggestions: receivedSuggestions }
                          : m
                      )
                    );
                  }
                  break;

                case 'error':
                  setError(event.error || 'Unknown error');
                  break;

                case 'done':
                  // Streaming complete
                  break;
              }
            } catch (parseErr) {
              console.warn(
                '[useObjectRefinementChat] Failed to parse SSE event:',
                json
              );
            }
          }
        }

        // Refresh conversation to get server-assigned IDs
        await loadConversation();
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          // Cancelled by user
          return;
        }
        const msg =
          err instanceof Error ? err.message : 'Failed to send message';
        setError(msg);
        console.error('[useObjectRefinementChat] send error:', err);

        // Remove optimistic messages on error
        setMessages((prev) =>
          prev.filter((m) => m.id !== userMsgId && m.id !== assistantMsgId)
        );
      } finally {
        setIsStreaming(false);
        streamingMessageIdRef.current = null;
        abortControllerRef.current = null;
      }
    },
    [
      objectId,
      activeProjectId,
      apiBase,
      buildHeaders,
      conversation?.id,
      loadConversation,
    ]
  );

  /**
   * Stop the current streaming response
   */
  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  /**
   * Apply a suggestion to the object
   */
  const applySuggestion = useCallback(
    async (
      messageId: string,
      suggestionIndex: number
    ): Promise<ApplySuggestionResult> => {
      if (!objectId || !activeProjectId || objectVersion === null) {
        return { success: false, error: 'Invalid state' };
      }

      try {
        const url = `${apiBase}/api/objects/${objectId}/refinement-chat/apply`;
        const result = await fetchJson<ApplySuggestionResult>(url, {
          method: 'POST',
          body: {
            messageId,
            suggestionIndex,
            expectedVersion: objectVersion,
          },
        });

        if (result.success) {
          // Update suggestion status in local state
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId && m.suggestions
                ? {
                    ...m,
                    suggestions: m.suggestions.map((s, idx) =>
                      idx === suggestionIndex
                        ? { ...s, status: 'accepted' as SuggestionStatus }
                        : s
                    ),
                  }
                : m
            )
          );

          // Update object version
          if (result.newVersion !== undefined) {
            setObjectVersion(result.newVersion);
          }

          // Notify parent of update
          if (onObjectUpdated && result.newVersion !== undefined) {
            onObjectUpdated(result.newVersion);
          }
        }

        return result;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to apply suggestion';
        console.error('[useObjectRefinementChat] applySuggestion error:', err);
        return { success: false, error: msg };
      }
    },
    [
      objectId,
      activeProjectId,
      objectVersion,
      apiBase,
      fetchJson,
      onObjectUpdated,
    ]
  );

  /**
   * Reject a suggestion
   */
  const rejectSuggestion = useCallback(
    async (
      messageId: string,
      suggestionIndex: number,
      reason?: string
    ): Promise<{ success: boolean; error?: string }> => {
      if (!objectId || !activeProjectId) {
        return { success: false, error: 'Invalid state' };
      }

      try {
        const url = `${apiBase}/api/objects/${objectId}/refinement-chat/reject`;
        const result = await fetchJson<{ success: boolean; error?: string }>(
          url,
          {
            method: 'POST',
            body: {
              messageId,
              suggestionIndex,
              reason,
            },
          }
        );

        if (result.success) {
          // Update suggestion status in local state
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId && m.suggestions
                ? {
                    ...m,
                    suggestions: m.suggestions.map((s, idx) =>
                      idx === suggestionIndex
                        ? { ...s, status: 'rejected' as SuggestionStatus }
                        : s
                    ),
                  }
                : m
            )
          );
        }

        return result;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to reject suggestion';
        console.error('[useObjectRefinementChat] rejectSuggestion error:', err);
        return { success: false, error: msg };
      }
    },
    [objectId, activeProjectId, apiBase, fetchJson]
  );

  /**
   * Refresh messages from server
   */
  const refresh = useCallback(async () => {
    await loadConversation();
  }, [loadConversation]);

  // Load conversation on mount and when objectId changes
  useEffect(() => {
    if (objectId && activeProjectId) {
      loadConversation();
    }
  }, [objectId, activeProjectId, loadConversation]);

  // Set up polling for shared chat updates
  useEffect(() => {
    if (pollInterval <= 0 || !conversation?.id || isStreaming) {
      return;
    }

    const poll = async () => {
      if (!isStreaming && conversation?.id) {
        try {
          const url = `${apiBase}/api/objects/${objectId}/refinement-chat/messages`;
          const serverMessages = await fetchJson<RefinementMessage[]>(url, {
            suppressErrorLog: true,
          });

          // Only update if we have more messages from server
          if (serverMessages.length > messages.length) {
            setMessages(serverMessages);
          }
        } catch {
          // Ignore polling errors
        }
      }
      pollTimeoutRef.current = setTimeout(poll, pollInterval);
    };

    pollTimeoutRef.current = setTimeout(poll, pollInterval);

    return () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };
  }, [
    pollInterval,
    conversation?.id,
    isStreaming,
    objectId,
    apiBase,
    fetchJson,
    messages.length,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  return {
    conversation,
    messages,
    isLoading,
    isStreaming,
    error,
    objectVersion,
    send,
    stop,
    applySuggestion,
    rejectSuggestion,
    refresh,
  };
}

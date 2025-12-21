import { useCallback, useEffect, useRef, useState } from 'react';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';
import type {
  MergeChatConversation,
  MergeChatMessage,
  MergeChatSuggestion,
  MergeChatStreamEvent,
  ApplyMergeSuggestionResult,
  MergePreview,
} from '@/types/merge-chat';
import type { SuggestionStatus } from '@/types/object-refinement';

function uid(prefix = 'msg'): string {
  return `${prefix}_${Math.random()
    .toString(36)
    .slice(2, 10)}${Date.now().toString(36)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export interface UseMergeChatOptions {
  /**
   * The task ID for the merge suggestion
   */
  taskId: string;

  /**
   * Source object ID
   */
  sourceObjectId: string;

  /**
   * Target object ID
   */
  targetObjectId: string;

  /**
   * Callback when merge preview changes
   */
  onPreviewChange?: (preview: MergePreview) => void;

  /**
   * Polling interval for checking new messages (ms). Set to 0 to disable.
   * Default: 5000 (5 seconds)
   */
  pollInterval?: number;
}

export interface UseMergeChatReturn {
  // State
  conversation: MergeChatConversation | null;
  messages: MergeChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  mergePreview: MergePreview | null;
  /**
   * True if this is a new conversation with no messages yet.
   * Used to determine whether to auto-send the initial prompt.
   */
  isNewConversation: boolean;

  // Actions
  send: (content: string) => Promise<void>;
  stop: () => void;
  applySuggestion: (
    messageId: string,
    suggestionIndex: number
  ) => Promise<ApplyMergeSuggestionResult>;
  rejectSuggestion: (
    messageId: string,
    suggestionIndex: number,
    reason?: string
  ) => Promise<{ success: boolean; error?: string }>;
  refresh: () => Promise<void>;
}

/**
 * Hook for managing merge chat functionality.
 *
 * Provides streaming chat with the AI assistant to help merge two graph objects,
 * including applying and rejecting property merge suggestions.
 */
export function useMergeChat(options: UseMergeChatOptions): UseMergeChatReturn {
  const {
    taskId,
    sourceObjectId,
    targetObjectId,
    onPreviewChange,
    pollInterval = 5000,
  } = options;

  const {
    config: { activeProjectId },
  } = useConfig();
  const { apiBase, buildHeaders, fetchJson } = useApi();

  // State
  const [conversation, setConversation] =
    useState<MergeChatConversation | null>(null);
  const [messages, setMessages] = useState<MergeChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mergePreview, setMergePreview] = useState<MergePreview | null>(null);
  // Track if this is a new conversation (no messages loaded from server)
  const [isNewConversation, setIsNewConversation] = useState(false);

  // Refs for streaming control
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Update merge preview and notify parent
   */
  const updateMergePreview = useCallback(
    (preview: MergePreview) => {
      setMergePreview(preview);
      onPreviewChange?.(preview);
    },
    [onPreviewChange]
  );

  /**
   * Load or create conversation for this task
   */
  const loadConversation = useCallback(async () => {
    if (!taskId || !activeProjectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const url = `${apiBase}/api/tasks/${taskId}/merge-chat`;
      const result = await fetchJson<{
        conversation: MergeChatConversation;
        messages: MergeChatMessage[];
        mergePreview?: MergePreview;
      }>(url);

      setConversation(result.conversation);
      setMessages(result.messages || []);
      // Mark as new conversation if no messages exist yet
      setIsNewConversation((result.messages || []).length === 0);
      if (result.mergePreview) {
        updateMergePreview(result.mergePreview);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to load conversation';
      setError(msg);
      console.error('[useMergeChat] loadConversation error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [taskId, activeProjectId, apiBase, fetchJson, updateMergePreview]);

  /**
   * Send a message and stream the response
   */
  const send = useCallback(
    async (content: string) => {
      if (!taskId || !activeProjectId || !content.trim()) return;

      // Abort any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      setIsStreaming(true);
      setError(null);
      // No longer a new conversation once we send a message
      setIsNewConversation(false);

      // Optimistically add user message
      const userMsgId = uid('msg');
      const userMessage: MergeChatMessage = {
        id: userMsgId,
        role: 'user',
        content: content.trim(),
        createdAt: nowIso(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Create placeholder for assistant response
      const assistantMsgId = uid('msg');
      streamingMessageIdRef.current = assistantMsgId;
      const assistantMessage: MergeChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        createdAt: nowIso(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      abortControllerRef.current = new AbortController();

      try {
        const url = `${apiBase}/api/tasks/${taskId}/merge-chat`;
        const response = await fetch(url, {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify({
            content: content.trim(),
            sourceObjectId,
            targetObjectId,
          }),
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
        let receivedSuggestions: MergeChatSuggestion[] = [];

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
              const event = JSON.parse(json) as MergeChatStreamEvent;

              switch (event.type) {
                case 'meta':
                  if (event.conversationId && !conversation?.id) {
                    setConversation((prev) =>
                      prev ? { ...prev, id: event.conversationId } : null
                    );
                  }
                  if (event.generation_error) {
                    console.warn(
                      '[useMergeChat] Generation error:',
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
                      propertyKey: s.propertyKey,
                      explanation: s.explanation || '',
                      sourceValue: s.sourceValue,
                      targetValue: s.targetValue,
                      suggestedValue: s.suggestedValue,
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
              console.warn('[useMergeChat] Failed to parse SSE event:', json);
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
        console.error('[useMergeChat] send error:', err);

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
      taskId,
      activeProjectId,
      sourceObjectId,
      targetObjectId,
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
   * Apply a merge suggestion
   */
  const applySuggestion = useCallback(
    async (
      messageId: string,
      suggestionIndex: number
    ): Promise<ApplyMergeSuggestionResult> => {
      if (!taskId || !activeProjectId) {
        return { success: false, error: 'Invalid state' };
      }

      try {
        const url = `${apiBase}/api/tasks/${taskId}/merge-chat/apply`;
        const result = await fetchJson<ApplyMergeSuggestionResult>(url, {
          method: 'POST',
          body: {
            messageId,
            suggestionIndex,
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

          // Update merge preview if returned
          if (result.updatedProperties && mergePreview) {
            updateMergePreview({
              ...mergePreview,
              suggestedProperties: result.updatedProperties,
            });
          }
        }

        return result;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to apply suggestion';
        console.error('[useMergeChat] applySuggestion error:', err);
        return { success: false, error: msg };
      }
    },
    [
      taskId,
      activeProjectId,
      apiBase,
      fetchJson,
      mergePreview,
      updateMergePreview,
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
      if (!taskId || !activeProjectId) {
        return { success: false, error: 'Invalid state' };
      }

      try {
        const url = `${apiBase}/api/tasks/${taskId}/merge-chat/reject`;
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
        console.error('[useMergeChat] rejectSuggestion error:', err);
        return { success: false, error: msg };
      }
    },
    [taskId, activeProjectId, apiBase, fetchJson]
  );

  /**
   * Refresh messages from server
   */
  const refresh = useCallback(async () => {
    await loadConversation();
  }, [loadConversation]);

  // Load conversation on mount and when taskId changes
  useEffect(() => {
    if (taskId && activeProjectId) {
      loadConversation();
    }
  }, [taskId, activeProjectId, loadConversation]);

  // Set up polling for shared chat updates
  useEffect(() => {
    if (pollInterval <= 0 || !conversation?.id || isStreaming) {
      return;
    }

    const poll = async () => {
      if (!isStreaming && conversation?.id) {
        try {
          const url = `${apiBase}/api/tasks/${taskId}/merge-chat/messages`;
          const serverMessages = await fetchJson<MergeChatMessage[]>(url, {
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
    taskId,
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
    mergePreview,
    isNewConversation,
    send,
    stop,
    applySuggestion,
    rejectSuggestion,
    refresh,
  };
}

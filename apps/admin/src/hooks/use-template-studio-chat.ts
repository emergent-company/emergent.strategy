import { useCallback, useEffect, useRef, useState } from 'react';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';

// Types for Template Pack Studio
export type SuggestionType =
  | 'add_object_type'
  | 'modify_object_type'
  | 'remove_object_type'
  | 'add_relationship_type'
  | 'modify_relationship_type'
  | 'remove_relationship_type'
  | 'update_ui_config'
  | 'update_extraction_prompt';

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected';

export interface SchemaSuggestion {
  id: string;
  type: SuggestionType;
  target_type: string;
  description: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  status: SuggestionStatus;
}

export interface ToolCall {
  id: string;
  tool: string;
  args?: Record<string, unknown>;
  result?: unknown;
  status: 'pending' | 'completed';
}

export interface StudioMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  suggestions?: SchemaSuggestion[];
  toolCalls?: ToolCall[];
  createdAt: string;
}

export interface TemplatePack {
  id: string;
  name: string;
  version: string;
  description?: string;
  object_type_schemas: Record<string, unknown>;
  relationship_type_schemas: Record<string, unknown>;
  ui_configs: Record<string, unknown>;
  extraction_prompts: Record<string, unknown>;
  draft: boolean;
  parent_version_id?: string;
}

export interface StudioSession {
  id: string;
  status: 'active' | 'completed' | 'discarded';
  pack: TemplatePack;
  messages: StudioMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface StudioStreamEvent {
  type:
    | 'meta'
    | 'token'
    | 'suggestions'
    | 'error'
    | 'done'
    | 'tool_call'
    | 'tool_result';
  sessionId?: string;
  packId?: string;
  token?: string;
  suggestions?: SchemaSuggestion[];
  error?: string;
  generation_error?: string;
  generation_disabled?: boolean;
  // Tool-related fields
  toolCallId?: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
}

export interface ApplySuggestionResult {
  success: boolean;
  error?: string;
  pack?: TemplatePack;
}

function uid(prefix = 'msg'): string {
  return `${prefix}_${Math.random()
    .toString(36)
    .slice(2, 10)}${Date.now().toString(36)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export interface UseTemplateStudioChatOptions {
  /**
   * Existing session ID to resume
   */
  sessionId?: string;

  /**
   * Source pack ID to clone (for editing existing packs)
   */
  sourcePackId?: string;

  /**
   * Initial name for new packs
   */
  initialName?: string;

  /**
   * Callback when pack is updated
   */
  onPackUpdated?: (pack: TemplatePack) => void;

  /**
   * Callback when session is saved
   */
  onSaved?: (pack: TemplatePack) => void;

  /**
   * Callback when a new session is created (useful for updating URL)
   */
  onSessionCreated?: (session: StudioSession) => void;
}

export interface UseTemplateStudioChatReturn {
  // State
  session: StudioSession | null;
  messages: StudioMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;

  // Actions
  createSession: (options?: {
    sourcePackId?: string;
    name?: string;
    description?: string;
  }) => Promise<StudioSession | null>;
  send: (content: string) => Promise<void>;
  stop: () => void;
  applySuggestion: (
    messageId: string,
    suggestionId: string
  ) => Promise<ApplySuggestionResult>;
  rejectSuggestion: (
    messageId: string,
    suggestionId: string,
    reason?: string
  ) => Promise<{ success: boolean; error?: string }>;
  savePack: (options: {
    name: string;
    description?: string;
    version: string;
  }) => Promise<TemplatePack | null>;
  renamePack: (name: string) => Promise<{ success: boolean; error?: string }>;
  discardSession: () => Promise<boolean>;
  refresh: () => Promise<void>;
}

/**
 * Hook for managing Template Pack Studio chat functionality.
 *
 * Provides streaming chat with the AI assistant to create and edit
 * template packs, including applying and rejecting schema suggestions.
 */
export function useTemplateStudioChat(
  options: UseTemplateStudioChatOptions = {}
): UseTemplateStudioChatReturn {
  const {
    sessionId: initialSessionId,
    sourcePackId,
    initialName,
    onPackUpdated,
    onSaved,
    onSessionCreated,
  } = options;

  const {
    config: { activeProjectId },
  } = useConfig();
  const { apiBase, buildHeaders, fetchJson } = useApi();

  // State
  const [session, setSession] = useState<StudioSession | null>(null);
  const [messages, setMessages] = useState<StudioMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for streaming control
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);
  // Track if we've already initiated session loading to prevent infinite loops
  const sessionLoadInitiatedRef = useRef<string | null>(null);

  /**
   * Create a new studio session
   */
  const createSession = useCallback(
    async (opts?: {
      sourcePackId?: string;
      name?: string;
      description?: string;
    }): Promise<StudioSession | null> => {
      if (!activeProjectId) {
        setError('No project selected');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const url = opts?.sourcePackId
          ? `${apiBase}/api/template-packs/studio/${opts.sourcePackId}`
          : `${apiBase}/api/template-packs/studio`;

        const body = opts?.sourcePackId
          ? undefined
          : {
              name: opts?.name || initialName,
              description: opts?.description,
            };

        const result = await fetchJson<StudioSession>(url, {
          method: 'POST',
          body,
        });

        setSession(result);
        setMessages(result.messages || []);
        onSessionCreated?.(result);
        return result;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to create session';
        setError(msg);
        console.error('[useTemplateStudioChat] createSession error:', err);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [activeProjectId, apiBase, fetchJson, initialName, onSessionCreated]
  );

  /**
   * Load an existing session
   */
  const loadSession = useCallback(
    async (sessionId: string) => {
      if (!activeProjectId) return;

      setIsLoading(true);
      setError(null);

      try {
        const url = `${apiBase}/api/template-packs/studio/session/${sessionId}`;
        const result = await fetchJson<StudioSession>(url);

        setSession(result);
        // Merge server messages with client-side toolCalls data
        // Server doesn't store toolCalls, so we preserve them from current state
        // Match by position since IDs may differ between client (optimistic) and server
        setMessages((currentMessages) => {
          const serverMessages = result.messages || [];

          // Build a map of toolCalls by assistant message index
          // (index among assistant messages only)
          const toolCallsByAssistantIndex = new Map<number, ToolCall[]>();
          let assistantIndex = 0;
          for (const msg of currentMessages) {
            if (msg.role === 'assistant') {
              if (msg.toolCalls && msg.toolCalls.length > 0) {
                toolCallsByAssistantIndex.set(assistantIndex, msg.toolCalls);
              }
              assistantIndex++;
            }
          }

          // Apply toolCalls to server messages by assistant index
          let serverAssistantIndex = 0;
          return serverMessages.map((serverMsg) => {
            if (serverMsg.role === 'assistant') {
              const toolCalls =
                toolCallsByAssistantIndex.get(serverAssistantIndex);
              serverAssistantIndex++;
              if (toolCalls) {
                return { ...serverMsg, toolCalls };
              }
            }
            return serverMsg;
          });
        });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to load session';
        setError(msg);
        console.error('[useTemplateStudioChat] loadSession error:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [activeProjectId, apiBase, fetchJson]
  );

  /**
   * Send a message and stream the response
   */
  const send = useCallback(
    async (content: string) => {
      if (!session?.id || !activeProjectId || !content.trim()) return;

      // Abort any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      setIsStreaming(true);
      setError(null);

      // Optimistically add user message
      const userMsgId = uid('msg');
      const userMessage: StudioMessage = {
        id: userMsgId,
        role: 'user',
        content: content.trim(),
        createdAt: nowIso(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Create placeholder for assistant response
      const assistantMsgId = uid('msg');
      streamingMessageIdRef.current = assistantMsgId;
      const assistantMessage: StudioMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        createdAt: nowIso(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      abortControllerRef.current = new AbortController();

      try {
        const url = `${apiBase}/api/template-packs/studio/session/${session.id}/chat`;
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
        let receivedSuggestions: SchemaSuggestion[] = [];
        let toolCalls: ToolCall[] = [];

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
              const event = JSON.parse(json) as StudioStreamEvent;

              switch (event.type) {
                case 'meta':
                  if (event.generation_error) {
                    console.warn(
                      '[useTemplateStudioChat] Generation error:',
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
                          ? { ...m, content: accumulatedContent, toolCalls }
                          : m
                      )
                    );
                  }
                  break;

                case 'tool_call':
                  if (event.toolCallId && event.tool) {
                    const newToolCall: ToolCall = {
                      id: event.toolCallId,
                      tool: event.tool,
                      args: event.args,
                      status: 'pending',
                    };
                    toolCalls = [...toolCalls, newToolCall];
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMsgId ? { ...m, toolCalls } : m
                      )
                    );
                  }
                  break;

                case 'tool_result':
                  if (event.toolCallId) {
                    toolCalls = toolCalls.map((tc) =>
                      tc.id === event.toolCallId
                        ? {
                            ...tc,
                            result: event.result,
                            status: 'completed' as const,
                          }
                        : tc
                    );
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMsgId ? { ...m, toolCalls } : m
                      )
                    );
                  }
                  break;

                case 'suggestions':
                  if (event.suggestions && Array.isArray(event.suggestions)) {
                    receivedSuggestions = event.suggestions.map((s) => ({
                      ...s,
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
                '[useTemplateStudioChat] Failed to parse SSE event:',
                json
              );
            }
          }
        }

        // Refresh session to get server-assigned IDs and updated pack
        await loadSession(session.id);
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          // Cancelled by user
          return;
        }
        const msg =
          err instanceof Error ? err.message : 'Failed to send message';
        setError(msg);
        console.error('[useTemplateStudioChat] send error:', err);

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
    [session?.id, activeProjectId, apiBase, buildHeaders, loadSession]
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
   * Apply a suggestion to the draft pack
   */
  const applySuggestion = useCallback(
    async (
      messageId: string,
      suggestionId: string
    ): Promise<ApplySuggestionResult> => {
      if (!session?.id || !activeProjectId) {
        return { success: false, error: 'Invalid state' };
      }

      try {
        const url = `${apiBase}/api/template-packs/studio/session/${session.id}/apply`;
        const result = await fetchJson<ApplySuggestionResult>(url, {
          method: 'POST',
          body: {
            messageId,
            suggestionId,
          },
        });

        if (result.success) {
          // Update suggestion status in local state
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId && m.suggestions
                ? {
                    ...m,
                    suggestions: m.suggestions.map((s) =>
                      s.id === suggestionId
                        ? { ...s, status: 'accepted' as SuggestionStatus }
                        : s
                    ),
                  }
                : m
            )
          );

          // Update pack in session
          if (result.pack) {
            setSession((prev) =>
              prev ? { ...prev, pack: result.pack as TemplatePack } : null
            );
            onPackUpdated?.(result.pack);
          }
        }

        return result;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to apply suggestion';
        console.error('[useTemplateStudioChat] applySuggestion error:', err);
        return { success: false, error: msg };
      }
    },
    [session?.id, activeProjectId, apiBase, fetchJson, onPackUpdated]
  );

  /**
   * Reject a suggestion
   */
  const rejectSuggestion = useCallback(
    async (
      messageId: string,
      suggestionId: string,
      reason?: string
    ): Promise<{ success: boolean; error?: string }> => {
      if (!session?.id || !activeProjectId) {
        return { success: false, error: 'Invalid state' };
      }

      try {
        const url = `${apiBase}/api/template-packs/studio/session/${session.id}/reject`;
        const result = await fetchJson<{ success: boolean; error?: string }>(
          url,
          {
            method: 'POST',
            body: {
              messageId,
              suggestionId,
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
                    suggestions: m.suggestions.map((s) =>
                      s.id === suggestionId
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
        console.error('[useTemplateStudioChat] rejectSuggestion error:', err);
        return { success: false, error: msg };
      }
    },
    [session?.id, activeProjectId, apiBase, fetchJson]
  );

  /**
   * Save the pack
   */
  const savePack = useCallback(
    async (saveOptions: {
      name: string;
      description?: string;
      version: string;
    }): Promise<TemplatePack | null> => {
      if (!session?.id || !activeProjectId) {
        setError('Invalid state');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const url = `${apiBase}/api/template-packs/studio/session/${session.id}/save`;
        const pack = await fetchJson<TemplatePack>(url, {
          method: 'POST',
          body: saveOptions,
        });

        // Update session status
        setSession((prev) =>
          prev ? { ...prev, status: 'completed', pack } : null
        );

        onSaved?.(pack);
        return pack;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save pack';
        setError(msg);
        console.error('[useTemplateStudioChat] savePack error:', err);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [session?.id, activeProjectId, apiBase, fetchJson, onSaved]
  );

  /**
   * Rename the pack
   */
  const renamePack = useCallback(
    async (name: string): Promise<{ success: boolean; error?: string }> => {
      if (!session?.id || !activeProjectId) {
        return { success: false, error: 'Invalid state' };
      }

      if (!name.trim()) {
        return { success: false, error: 'Name is required' };
      }

      try {
        const url = `${apiBase}/api/template-packs/studio/session/${session.id}/name`;
        const result = await fetchJson<{
          success: boolean;
          pack?: TemplatePack;
          error?: string;
        }>(url, {
          method: 'PATCH',
          body: { name: name.trim() },
        });

        if (result.success && result.pack) {
          // Update pack in session
          setSession((prev) =>
            prev ? { ...prev, pack: result.pack as TemplatePack } : null
          );
          onPackUpdated?.(result.pack);
        }

        return { success: result.success, error: result.error };
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to rename pack';
        console.error('[useTemplateStudioChat] renamePack error:', err);
        return { success: false, error: msg };
      }
    },
    [session?.id, activeProjectId, apiBase, fetchJson, onPackUpdated]
  );

  /**
   * Discard the session
   */
  const discardSession = useCallback(async (): Promise<boolean> => {
    if (!session?.id || !activeProjectId) {
      return false;
    }

    setIsLoading(true);

    try {
      const url = `${apiBase}/api/template-packs/studio/session/${session.id}`;
      const result = await fetchJson<{ success: boolean }>(url, {
        method: 'DELETE',
      });

      if (result.success) {
        setSession(null);
        setMessages([]);
      }

      return result.success;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to discard session';
      console.error('[useTemplateStudioChat] discardSession error:', err);
      setError(msg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [session?.id, activeProjectId, apiBase, fetchJson]);

  /**
   * Refresh session from server
   */
  const refresh = useCallback(async () => {
    if (session?.id) {
      await loadSession(session.id);
    }
  }, [session?.id, loadSession]);

  // Load session on mount if sessionId provided
  useEffect(() => {
    // Build a key to track what we've already initiated loading for
    const loadKey = initialSessionId
      ? `session:${initialSessionId}`
      : sourcePackId
      ? `source:${sourcePackId}`
      : null;

    // Skip if we've already initiated loading for this key
    if (loadKey && sessionLoadInitiatedRef.current === loadKey) {
      return;
    }

    if (initialSessionId && activeProjectId) {
      sessionLoadInitiatedRef.current = loadKey;
      loadSession(initialSessionId);
    } else if (sourcePackId && activeProjectId && !session) {
      sessionLoadInitiatedRef.current = loadKey;
      // Auto-create session for editing existing pack
      createSession({ sourcePackId });
    }
  }, [
    initialSessionId,
    sourcePackId,
    activeProjectId,
    loadSession,
    createSession,
    session,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    session,
    messages,
    isLoading,
    isStreaming,
    error,
    createSession,
    send,
    stop,
    applySuggestion,
    rejectSuggestion,
    savePack,
    renamePack,
    discardSession,
    refresh,
  };
}

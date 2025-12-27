import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '@/hooks/use-api';

/**
 * Types for email template refinement chat
 */
export type EmailTemplateSuggestionType = 'mjml_change' | 'subject_change';
export type EmailTemplateSuggestionStatus = 'pending' | 'accepted' | 'rejected';

export interface EmailTemplateSuggestion {
  index: number;
  type: EmailTemplateSuggestionType;
  explanation: string;
  newContent: string;
  status: EmailTemplateSuggestionStatus;
  generatedForVersion?: number;
}

export interface EmailTemplateRefinementMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  userId?: string;
  suggestions?: EmailTemplateSuggestion[];
  createdAt: string;
}

export interface EmailTemplateRefinementConversation {
  id: string;
  templateId: string;
  templateName: string;
  messages: EmailTemplateRefinementMessage[];
  createdAt: string;
}

export interface ApplyEmailTemplateSuggestionResult {
  success: boolean;
  error?: string;
  versionNumber?: number;
}

interface RefinementStreamEvent {
  type: 'meta' | 'token' | 'suggestions' | 'done' | 'error';
  conversationId?: string;
  currentVersionNumber?: number;
  generation_error?: string;
  token?: string;
  suggestions?: EmailTemplateSuggestion[];
  error?: string;
}

function uid(prefix = 'msg'): string {
  return `${prefix}_${Math.random()
    .toString(36)
    .slice(2, 10)}${Date.now().toString(36)}`;
}

function nowIso() {
  return new Date().toISOString();
}

export interface UseEmailTemplateRefinementChatOptions {
  /**
   * The template ID to chat about
   */
  templateId: string;

  /**
   * Current MJML content to include in context
   */
  currentMjml?: string;

  /**
   * Current subject template to include in context
   */
  currentSubject?: string;

  /**
   * Callback when template is updated (after applying suggestion)
   */
  onTemplateUpdated?: (newVersion: number) => void;
}

export interface UseEmailTemplateRefinementChatReturn {
  // State
  conversation: EmailTemplateRefinementConversation | null;
  messages: EmailTemplateRefinementMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;

  // Actions
  send: (content: string) => Promise<void>;
  stop: () => void;
  applySuggestion: (
    messageId: string,
    suggestionIndex: number,
    type: EmailTemplateSuggestionType,
    newContent: string,
    changeSummary?: string
  ) => Promise<ApplyEmailTemplateSuggestionResult>;
  refresh: () => Promise<void>;
}

/**
 * Hook for managing email template refinement chat functionality.
 *
 * Provides streaming chat with the AI assistant to refine email template MJML
 * and subject templates, including applying suggestions.
 */
export function useEmailTemplateRefinementChat(
  options: UseEmailTemplateRefinementChatOptions
): UseEmailTemplateRefinementChatReturn {
  const { templateId, currentMjml, currentSubject, onTemplateUpdated } =
    options;

  const { apiBase, buildHeaders, fetchJson } = useApi();

  // State
  const [conversation, setConversation] =
    useState<EmailTemplateRefinementConversation | null>(null);
  const [messages, setMessages] = useState<EmailTemplateRefinementMessage[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for streaming control
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamingMessageIdRef = useRef<string | null>(null);

  /**
   * Load or create conversation for this template.
   * When mergeLocalState is true, preserves local suggestion statuses.
   */
  const loadConversation = useCallback(
    async (mergeLocalState = false) => {
      if (!templateId) return;

      setIsLoading(true);
      setError(null);

      try {
        const url = `${apiBase}/api/superadmin/email-templates/${templateId}/refinement-chat`;
        const result = await fetchJson<EmailTemplateRefinementConversation>(
          url
        );

        setConversation(result);

        if (mergeLocalState) {
          setMessages((prevMessages) => {
            const serverMessages = result.messages || [];
            return serverMessages.map((serverMsg) => {
              const localMsg = prevMessages.find(
                (m) =>
                  m.id === serverMsg.id ||
                  (m.role === serverMsg.role &&
                    m.content === serverMsg.content &&
                    m.createdAt === serverMsg.createdAt)
              );
              if (localMsg?.suggestions && serverMsg.suggestions) {
                return {
                  ...serverMsg,
                  suggestions: serverMsg.suggestions.map((serverSugg, idx) => {
                    const localSugg = localMsg.suggestions?.[idx];
                    if (
                      localSugg &&
                      localSugg.status !== 'pending' &&
                      serverSugg.status === 'pending'
                    ) {
                      return { ...serverSugg, status: localSugg.status };
                    }
                    return serverSugg;
                  }),
                };
              }
              return serverMsg;
            });
          });
        } else {
          setMessages(result.messages || []);
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to load conversation';
        setError(msg);
        console.error(
          '[useEmailTemplateRefinementChat] loadConversation error:',
          err
        );
      } finally {
        setIsLoading(false);
      }
    },
    [templateId, apiBase, fetchJson]
  );

  /**
   * Send a message and stream the response
   */
  const send = useCallback(
    async (content: string) => {
      if (!templateId || !content.trim()) return;

      // Abort any existing stream
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      setIsStreaming(true);
      setError(null);

      // Optimistically add user message
      const userMsgId = uid('msg');
      const userMessage: EmailTemplateRefinementMessage = {
        id: userMsgId,
        role: 'user',
        content: content.trim(),
        createdAt: nowIso(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Create placeholder for assistant response
      const assistantMsgId = uid('msg');
      streamingMessageIdRef.current = assistantMsgId;
      const assistantMessage: EmailTemplateRefinementMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        createdAt: nowIso(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      abortControllerRef.current = new AbortController();

      try {
        const url = `${apiBase}/api/superadmin/email-templates/${templateId}/refinement-chat`;
        const response = await fetch(url, {
          method: 'POST',
          headers: buildHeaders(),
          body: JSON.stringify({
            content: content.trim(),
            currentMjml,
            currentSubject,
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
        let receivedSuggestions: EmailTemplateSuggestion[] = [];

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
                      prev ? { ...prev, id: event.conversationId! } : null
                    );
                  }
                  if (event.generation_error) {
                    console.warn(
                      '[useEmailTemplateRefinementChat] Generation error:',
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
                      newContent: s.newContent || '',
                      status: 'pending' as EmailTemplateSuggestionStatus,
                      generatedForVersion: s.generatedForVersion,
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
                '[useEmailTemplateRefinementChat] Failed to parse SSE event:',
                json
              );
            }
          }
        }

        // Refresh conversation to get server-assigned IDs, preserving local suggestion statuses
        await loadConversation(true);
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          // Cancelled by user
          return;
        }
        const msg =
          err instanceof Error ? err.message : 'Failed to send message';
        setError(msg);
        console.error('[useEmailTemplateRefinementChat] send error:', err);

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
      templateId,
      apiBase,
      buildHeaders,
      currentMjml,
      currentSubject,
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

  const applySuggestion = useCallback(
    async (
      messageId: string,
      suggestionIndex: number,
      type: EmailTemplateSuggestionType,
      newContent: string,
      changeSummary?: string
    ): Promise<ApplyEmailTemplateSuggestionResult> => {
      if (!templateId) {
        return { success: false, error: 'Invalid state' };
      }

      try {
        const url = `${apiBase}/api/superadmin/email-templates/${templateId}/refinement-chat/apply`;
        const result = await fetchJson<ApplyEmailTemplateSuggestionResult>(
          url,
          {
            method: 'POST',
            body: {
              messageId,
              suggestionIndex,
              type,
              newContent,
              changeSummary,
            },
          }
        );

        if (result.success) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === messageId && m.suggestions
                ? {
                    ...m,
                    suggestions: m.suggestions.map((s, idx) =>
                      idx === suggestionIndex
                        ? {
                            ...s,
                            status: 'accepted' as EmailTemplateSuggestionStatus,
                          }
                        : s
                    ),
                  }
                : m
            )
          );

          if (onTemplateUpdated && result.versionNumber !== undefined) {
            onTemplateUpdated(result.versionNumber);
          }
        }

        return result;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to apply suggestion';
        console.error(
          '[useEmailTemplateRefinementChat] applySuggestion error:',
          err
        );
        return { success: false, error: msg };
      }
    },
    [templateId, apiBase, fetchJson, onTemplateUpdated]
  );

  /**
   * Refresh messages from server
   */
  const refresh = useCallback(async () => {
    await loadConversation();
  }, [loadConversation]);

  // Load conversation on mount and when templateId changes
  useEffect(() => {
    if (templateId) {
      loadConversation();
    }
  }, [templateId, loadConversation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    conversation,
    messages,
    isLoading,
    isStreaming,
    error,
    send,
    stop,
    applySuggestion,
    refresh,
  };
}

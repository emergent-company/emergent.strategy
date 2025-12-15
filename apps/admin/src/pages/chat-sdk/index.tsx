import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { useParams, useNavigate } from 'react-router';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from '@ai-sdk/react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useConfig } from '@/contexts/config';
import {
  MessageList,
  ChatInput,
  ConversationList,
  KeyboardShortcutsModal,
  type Conversation,
  type ActionTarget,
} from '@/components/chat';
import type {
  RefinementSuggestion,
  SuggestionStatus,
} from '@/types/object-refinement';

/**
 * Parse suggestions from message content.
 * Looks for ```suggestions [...] ``` blocks and parses the JSON.
 * Transforms raw LLM output into RefinementSuggestion format expected by SuggestionCard.
 */
function parseSuggestionsFromContent(
  content: string
): RefinementSuggestion[] | undefined {
  // Match ```suggestions ... ``` blocks
  const suggestionsMatch = content.match(/```suggestions\s*([\s\S]*?)```/);
  if (suggestionsMatch) {
    try {
      const parsed = JSON.parse(suggestionsMatch[1].trim());
      if (Array.isArray(parsed)) {
        // Transform raw LLM output into RefinementSuggestion format
        // LLM outputs: { type, propertyKey, oldValue, newValue, explanation, ... }
        // SuggestionCard expects: { index, type, explanation, status, details: { propertyKey, oldValue, newValue, ... } }
        return parsed.map((s, index) => {
          const { type, explanation, ...rest } = s;
          return {
            index,
            type: type || 'property_change',
            explanation: explanation || '',
            status: s.status || 'pending',
            details: rest, // Put propertyKey, oldValue, newValue, etc. into details
          } as RefinementSuggestion;
        });
      }
    } catch (e) {
      console.warn('Failed to parse suggestions:', e);
    }
  }
  return undefined;
}

export default function ChatSdkPage() {
  const { id: urlConversationId } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | undefined
  >();
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [isKeyboardShortcutsOpen, setIsKeyboardShortcutsOpen] = useState(false);
  /** Action target for suggestion cards (populated when conversation has an associated object) */
  const [actionTarget, setActionTarget] = useState<ActionTarget | undefined>();
  /** Object version for optimistic concurrency when applying/rejecting suggestions */
  const [objectVersion, setObjectVersion] = useState<number | null>(null);
  /** Current object properties for detecting outdated suggestions */
  const [objectProperties, setObjectProperties] = useState<Record<
    string,
    unknown
  > | null>(null);
  /** Track suggestion statuses by messageId and suggestionIndex */
  const [suggestionStatuses, setSuggestionStatuses] = useState<
    Record<string, Record<number, SuggestionStatus>>
  >({});
  /** Track which suggestion is currently being processed */
  const [loadingSuggestion, setLoadingSuggestion] = useState<{
    messageId: string;
    suggestionIndex: number;
  } | null>(null);
  const { apiBase, buildHeaders } = useApi();
  const { showToast } = useToast();
  const { config } = useConfig();
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInitialized = useRef(false);

  // Create transport with projectId and conversationId in body
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat-sdk',
        fetch: async (url, options) => {
          // Add projectId and conversationId to the request body
          const body = JSON.parse((options?.body as string) || '{}');
          body.projectId = config.activeProjectId;
          body.conversationId = activeConversationId; // Pass conversation ID to backend

          console.log('[ChatSDK] Sending request with:', {
            projectId: body.projectId,
            conversationId: body.conversationId,
            messagesCount: body.messages?.length,
          });

          return fetch(url, {
            ...options,
            body: JSON.stringify(body),
          });
        },
      }),
    [config.activeProjectId, activeConversationId]
  );

  const { messages, sendMessage, status, error, stop, setMessages } = useChat({
    transport,
    id: activeConversationId,
    onFinish: async (message) => {
      console.log('[ChatSDK] Message finished');
      console.log('[ChatSDK] Current messages count:', messages.length);
      console.log(
        '[ChatSDK] Current activeConversationId:',
        activeConversationId
      );

      // Always refresh the conversation list after a message
      setTimeout(() => {
        fetchConversations();
      }, 500);
    },
  });

  // Log whenever messages or activeConversationId changes
  useEffect(() => {
    console.log(
      '[ChatSDK] State changed - messages:',
      messages.length,
      'activeId:',
      activeConversationId
    );
  }, [messages.length, activeConversationId]);

  // Fetch conversations from server
  const fetchConversations = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/chat-ui/conversations`, {
        headers: buildHeaders({ json: false }),
      });
      if (response.ok) {
        const data: Conversation[] = await response.json();
        // Filter out empty conversations (e.g., refinement chats created but never used)
        const nonEmptyConversations = data.filter(
          (conv) => conv.messages && conv.messages.length > 0
        );
        setConversations(nonEmptyConversations);
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  }, [apiBase, buildHeaders]);

  const loadConversationMessages = useCallback(
    async (conversationId: string) => {
      // If we're already on this conversation and not loading, skip (optional optimization, but be careful with initial load)
      // For now, we trust the caller to only call this when needed.

      setActiveConversationId(conversationId);
      setIsLoadingConversation(true);
      setActionTarget(undefined); // Reset action target when loading new conversation
      setObjectVersion(null); // Reset object version when loading new conversation
      setObjectProperties(null); // Reset object properties when loading new conversation
      setSuggestionStatuses({}); // Reset suggestion statuses when loading new conversation
      setLoadingSuggestion(null); // Reset loading state when loading new conversation

      try {
        // Fetch conversation messages from backend
        const response = await fetch(
          `${apiBase}/api/chat-ui/conversations/${conversationId}`,
          {
            headers: buildHeaders({ json: false }),
          }
        );

        if (response.ok) {
          const data = await response.json();

          // Transform backend messages to AI SDK UIMessage format
          const formattedMessages: UIMessage[] = data.messages.map(
            (msg: any) => ({
              id: msg.id,
              role: msg.role as 'user' | 'assistant',
              parts: [
                {
                  type: 'text' as const,
                  text: msg.content,
                },
              ],
              createdAt: msg.createdAt,
            })
          );

          // Load messages into the chat
          setMessages(formattedMessages);

          // Load suggestion statuses from message citations (backend stores them in citations.suggestionStatuses)
          const loadedStatuses: Record<
            string,
            Record<number, 'pending' | 'accepted' | 'rejected'>
          > = {};
          for (const msg of data.messages) {
            if (msg.citations?.suggestionStatuses) {
              const messageStatuses: Record<
                number,
                'pending' | 'accepted' | 'rejected'
              > = {};
              for (const statusEntry of msg.citations.suggestionStatuses) {
                if (
                  typeof statusEntry.index === 'number' &&
                  statusEntry.status
                ) {
                  messageStatuses[statusEntry.index] = statusEntry.status;
                }
              }
              if (Object.keys(messageStatuses).length > 0) {
                loadedStatuses[msg.id] = messageStatuses;
              }
            }
          }
          if (Object.keys(loadedStatuses).length > 0) {
            console.log(
              '[ChatSDK] Loaded suggestion statuses from backend:',
              loadedStatuses
            );
            setSuggestionStatuses(loadedStatuses);
          }

          // Load draft text if conversation has no messages
          if (data.messages.length === 0 && data.draftText) {
            console.log('[ChatSDK] Loading draft text:', data.draftText);
            setInput(data.draftText);
          } else {
            setInput('');
          }

          // If conversation has an associated object, fetch its details for ActionCard display
          // Use resolveHead=true to get the HEAD version, since the conversation's objectId
          // may reference an older version if suggestions have been applied
          if (data.objectId) {
            console.log('[ChatSDK] Conversation has objectId:', data.objectId);
            try {
              const objectResponse = await fetch(
                `${apiBase}/api/graph/objects/${data.objectId}?resolveHead=true`,
                {
                  headers: buildHeaders({ json: false }),
                }
              );
              if (objectResponse.ok) {
                const objectData = await objectResponse.json();
                const target: ActionTarget = {
                  objectId: objectData.id,
                  objectName:
                    objectData.properties?.name || objectData.key || 'Unknown',
                  objectType: objectData.type || 'Unknown',
                };
                console.log('[ChatSDK] Loaded action target:', target);
                setActionTarget(target);
                // Set object version for apply/reject functionality
                if (typeof objectData.version === 'number') {
                  setObjectVersion(objectData.version);
                  console.log(
                    '[ChatSDK] Loaded object version:',
                    objectData.version
                  );
                }
                // Store object properties for outdated detection
                if (objectData.properties) {
                  setObjectProperties(objectData.properties);
                  console.log(
                    '[ChatSDK] Loaded object properties for outdated detection'
                  );
                }
              }
            } catch (objErr) {
              console.warn('[ChatSDK] Failed to load object details:', objErr);
              // Don't fail the whole load if object fetch fails
            }
          }
        } else {
          console.error('Failed to load conversation:', response.statusText);
        }
      } catch (err) {
        console.error('Failed to load conversation:', err);
      } finally {
        setIsLoadingConversation(false);
      }
    },
    [apiBase, buildHeaders, setMessages]
  );

  const handleSelectConversation = (conv: Conversation) => {
    navigate(`/admin/chat-sdk/${conv.id}`);
  };

  // Initialize: Load conversations. If no ID in URL, find most recent and navigate.
  useEffect(() => {
    // Prevent double initialization
    if (hasInitialized.current) {
      return;
    }
    hasInitialized.current = true;

    const initializeChat = async () => {
      await fetchConversations();

      // If we already have an ID in the URL, the sync effect will handle loading.
      // We only need to handle the default case (no ID).
      if (!urlConversationId) {
        const response = await fetch(`${apiBase}/api/chat-ui/conversations`, {
          headers: buildHeaders({ json: false }),
        });

        if (response.ok) {
          const convos = await response.json();

          if (convos.length > 0) {
            // Load the most recent conversation
            const mostRecentConvo = convos[0];
            console.log(
              '[ChatSDK] No ID in URL, redirecting to most recent:',
              mostRecentConvo.id
            );
            navigate(`/admin/chat-sdk/${mostRecentConvo.id}`, {
              replace: true,
            });
          } else {
            // No conversations exist - create one
            console.log(
              '[ChatSDK] No conversations found. Creating initial conversation.'
            );

            const createResponse = await fetch(
              `${apiBase}/api/chat-sdk/conversations`,
              {
                method: 'POST',
                headers: buildHeaders({ json: true }),
                body: JSON.stringify({
                  title: 'New conversation',
                  projectId: config.activeProjectId,
                }),
              }
            );

            if (createResponse.ok) {
              const newConvo = await createResponse.json();
              console.log(
                '[ChatSDK] Created initial conversation:',
                newConvo.id
              );
              // Update URL to the new conversation
              navigate(`/admin/chat-sdk/${newConvo.id}`, { replace: true });
              await fetchConversations();
            }
          }
        }
      }
    };

    initializeChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  // Sync URL ID with active conversation state
  useEffect(() => {
    if (urlConversationId && urlConversationId !== activeConversationId) {
      console.log('[ChatSDK] URL ID changed, loading:', urlConversationId);
      loadConversationMessages(urlConversationId);
    } else if (!urlConversationId && activeConversationId) {
      // URL cleared, clear state
      console.log('[ChatSDK] URL ID cleared, clearing state');
      setActiveConversationId(undefined);
      setMessages([]);
      setInput('');
    }
  }, [
    urlConversationId,
    activeConversationId,
    loadConversationMessages,
    setMessages,
  ]);

  // Refresh conversations after sending a message
  useEffect(() => {
    if (status === 'ready' && messages.length > 0) {
      console.log(
        '[ChatSDK] Status ready with messages, refreshing conversations'
      );
      console.log('[ChatSDK] activeConversationId:', activeConversationId);
      console.log('[ChatSDK] messages count:', messages.length);

      // Small delay to ensure backend has saved the conversation
      const timer = setTimeout(() => {
        fetchConversations();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [status, messages.length, fetchConversations, activeConversationId]);

  // Save draft text as user types (debounced)
  useEffect(() => {
    // Clear any existing timer
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current);
    }

    // Only save if we have an active conversation and some input
    if (activeConversationId && input) {
      draftTimerRef.current = setTimeout(async () => {
        try {
          console.log('[ChatSDK] Saving draft text');
          await fetch(
            `${apiBase}/api/chat-ui/conversations/${activeConversationId}/draft`,
            {
              method: 'PATCH',
              headers: buildHeaders({ json: true }),
              body: JSON.stringify({ draftText: input }),
            }
          );
        } catch (err) {
          console.error('[ChatSDK] Failed to save draft:', err);
        }
      }, 1000); // Save after 1 second of no typing
    }

    // Cleanup
    return () => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
      }
    };
  }, [input, activeConversationId, apiBase, buildHeaders]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log(
      '[ChatSDK] Submit - status:',
      status,
      'input:',
      input.trim().substring(0, 20)
    );
    if (input.trim() && status === 'ready') {
      sendMessage({ text: input });
      setInput('');
    }
  };

  // Action handlers for message interactions
  const handleCopy = useCallback(
    (content: string) => {
      showToast({
        message: 'Message copied to clipboard',
        variant: 'success',
        duration: 2000,
      });
    },
    [showToast]
  );

  const handleThumbsUp = useCallback(() => {
    console.log('Thumbs up feedback');
    // TODO: Send feedback to analytics
  }, []);

  const handleThumbsDown = useCallback(() => {
    console.log('Thumbs down feedback');
    // TODO: Send feedback to analytics
  }, []);

  /**
   * Apply a suggestion to the object.
   * Updates the object with the suggested change and refreshes the object version.
   */
  const handleApplySuggestion = useCallback(
    async (messageId: string, suggestionIndex: number) => {
      if (!actionTarget?.objectId || objectVersion === null) {
        showToast({
          message: 'Cannot apply suggestion: no object context',
          variant: 'error',
          duration: 3000,
        });
        return;
      }

      console.log('[ChatSDK] Applying suggestion:', {
        messageId,
        suggestionIndex,
        objectId: actionTarget.objectId,
        expectedVersion: objectVersion,
      });

      // Set loading state
      setLoadingSuggestion({ messageId, suggestionIndex });

      try {
        const response = await fetch(
          `${apiBase}/api/objects/${actionTarget.objectId}/refinement-chat/apply`,
          {
            method: 'POST',
            headers: buildHeaders({ json: true }),
            body: JSON.stringify({
              messageId,
              suggestionIndex,
              expectedVersion: objectVersion,
            }),
          }
        );

        const result = await response.json();

        if (result.success) {
          showToast({
            message: 'Suggestion applied successfully',
            variant: 'success',
            duration: 2000,
          });

          // Update suggestion status in local state
          setSuggestionStatuses((prev) => ({
            ...prev,
            [messageId]: {
              ...prev[messageId],
              [suggestionIndex]: 'accepted',
            },
          }));

          // Update object version for subsequent apply/reject calls
          if (typeof result.newVersion === 'number') {
            setObjectVersion(result.newVersion);
          }

          // Update actionTarget with new object ID (patching creates a new version row)
          // and refresh object properties so other suggestions can detect if they're outdated
          const newObjectId = result.affectedId || actionTarget.objectId;
          if (
            result.affectedId &&
            result.affectedId !== actionTarget.objectId
          ) {
            console.log(
              '[ChatSDK] Object ID changed from',
              actionTarget.objectId,
              'to',
              result.affectedId
            );
            setActionTarget((prev) =>
              prev ? { ...prev, objectId: result.affectedId } : prev
            );
          }

          // Fetch fresh object properties using the NEW object ID
          try {
            const objectResponse = await fetch(
              `${apiBase}/api/graph/objects/${newObjectId}`,
              {
                headers: buildHeaders({ json: false }),
              }
            );
            if (objectResponse.ok) {
              const objectData = await objectResponse.json();
              if (objectData.properties) {
                setObjectProperties(objectData.properties);
                console.log('[ChatSDK] Updated object properties after apply');
              }
            }
          } catch (objErr) {
            console.warn(
              '[ChatSDK] Failed to refresh object properties:',
              objErr
            );
          }
        } else {
          showToast({
            message: result.error || 'Failed to apply suggestion',
            variant: 'error',
            duration: 3000,
          });
        }
      } catch (err) {
        console.error('[ChatSDK] Apply suggestion error:', err);
        showToast({
          message: 'Failed to apply suggestion',
          variant: 'error',
          duration: 3000,
        });
      } finally {
        // Clear loading state
        setLoadingSuggestion(null);
      }
    },
    [actionTarget, objectVersion, apiBase, buildHeaders, showToast]
  );

  /**
   * Reject a suggestion.
   * Marks the suggestion as rejected without applying changes.
   */
  const handleRejectSuggestion = useCallback(
    async (messageId: string, suggestionIndex: number) => {
      if (!actionTarget?.objectId) {
        showToast({
          message: 'Cannot reject suggestion: no object context',
          variant: 'error',
          duration: 3000,
        });
        return;
      }

      console.log('[ChatSDK] Rejecting suggestion:', {
        messageId,
        suggestionIndex,
        objectId: actionTarget.objectId,
      });

      try {
        const response = await fetch(
          `${apiBase}/api/objects/${actionTarget.objectId}/refinement-chat/reject`,
          {
            method: 'POST',
            headers: buildHeaders({ json: true }),
            body: JSON.stringify({
              messageId,
              suggestionIndex,
            }),
          }
        );

        const result = await response.json();

        if (result.success) {
          showToast({
            message: 'Suggestion rejected',
            variant: 'info',
            duration: 2000,
          });

          // Update suggestion status in local state
          setSuggestionStatuses((prev) => ({
            ...prev,
            [messageId]: {
              ...prev[messageId],
              [suggestionIndex]: 'rejected',
            },
          }));
        } else {
          showToast({
            message: result.error || 'Failed to reject suggestion',
            variant: 'error',
            duration: 3000,
          });
        }
      } catch (err) {
        console.error('[ChatSDK] Reject suggestion error:', err);
        showToast({
          message: 'Failed to reject suggestion',
          variant: 'error',
          duration: 3000,
        });
      }
    },
    [actionTarget, apiBase, buildHeaders, showToast]
  );

  const handleNewChat = async () => {
    console.log('[ChatSDK] Creating new conversation');

    try {
      // Always create a new conversation when user clicks "New Chat"
      const response = await fetch(`${apiBase}/api/chat-sdk/conversations`, {
        method: 'POST',
        headers: buildHeaders({ json: true }),
        body: JSON.stringify({
          title: 'New conversation',
          projectId: config.activeProjectId,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Failed to create conversation: ${response.statusText}`
        );
      }

      const data = await response.json();
      console.log('[ChatSDK] Backend created conversation:', data.id);

      // Refresh conversation list to show the new conversation
      await fetchConversations();

      console.log(
        '[ChatSDK] New conversation created, navigating to:',
        data.id
      );
      navigate(`/admin/chat-sdk/${data.id}`);
    } catch (err) {
      console.error('[ChatSDK] Failed to create conversation:', err);
      showToast({
        message: 'Failed to create new conversation',
        variant: 'error',
        duration: 3000,
      });
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    if (!window.confirm('Delete this conversation?')) return;

    try {
      const response = await fetch(
        `${apiBase}/api/chat-ui/conversations/${convId}`,
        {
          method: 'DELETE',
          headers: buildHeaders({ json: false }),
        }
      );
      if (response.ok) {
        fetchConversations();
        if (activeConversationId === convId) {
          navigate('/admin/chat-sdk');
        }
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  // Get suggestions from message content for rendering SuggestionCards
  const getSuggestions = useCallback(
    (messageId: string): RefinementSuggestion[] | undefined => {
      const message = messages.find((m) => m.id === messageId);
      if (!message || message.role !== 'assistant') return undefined;

      // Extract text content from message parts
      const textContent = message.parts
        ?.filter((part) => part.type === 'text')
        .map((part) => ('text' in part ? part.text : ''))
        .join('');

      if (!textContent) return undefined;

      const suggestions = parseSuggestionsFromContent(textContent);
      if (!suggestions) return undefined;

      // Merge locally tracked statuses and detect outdated suggestions
      const messageStatuses = suggestionStatuses[messageId];
      return suggestions.map((s, idx) => {
        // First apply any stored status
        const storedStatus = messageStatuses?.[idx];
        let status: SuggestionStatus = storedStatus || s.status;

        // Check if pending suggestion is outdated (oldValue doesn't match current)
        if (status === 'pending' && objectProperties) {
          const details = s.details as {
            propertyKey?: string;
            oldValue?: unknown;
          };
          if (details.propertyKey) {
            const currentValue = objectProperties[details.propertyKey];
            // Compare using JSON.stringify for deep equality
            const isOutdated =
              JSON.stringify(currentValue) !== JSON.stringify(details.oldValue);
            if (isOutdated) {
              status = 'outdated';
              console.log(
                `[ChatSDK] Suggestion ${idx} is outdated: ${details.propertyKey} changed from`,
                details.oldValue,
                'to',
                currentValue
              );
            }
          }
        }

        return {
          ...s,
          status,
        };
      });
    },
    [messages, suggestionStatuses, objectProperties]
  );

  return (
    <div className="drawer drawer-open h-full">
      <input id="chat-drawer" type="checkbox" className="drawer-toggle" />

      {/* Main Content - Fixed layout with scrollable message area */}
      <div className="drawer-content flex flex-col h-full overflow-hidden">
        <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full h-full overflow-hidden">
          {/* Message List - Scrollable middle section */}
          {isLoadingConversation ? (
            <div className="flex-1 flex items-center justify-center overflow-hidden">
              <div className="loading loading-spinner loading-lg"></div>
            </div>
          ) : (
            <div className="flex-1 overflow-hidden">
              <MessageList
                messages={messages}
                onCopy={handleCopy}
                onThumbsUp={handleThumbsUp}
                onThumbsDown={handleThumbsDown}
                isStreaming={status === 'streaming'}
                getSuggestions={getSuggestions}
                actionTarget={actionTarget}
                onApplySuggestion={handleApplySuggestion}
                onRejectSuggestion={handleRejectSuggestion}
                loadingSuggestion={loadingSuggestion}
              />
            </div>
          )}

          {/* Error Display - Above input */}
          {error && (
            <div className="shrink-0 mx-4 mb-2 p-4 bg-error/10 border border-error/40 text-error rounded-lg">
              <strong>Error:</strong> {error.message || 'An error occurred'}
            </div>
          )}

          {/* Chat Input - Fixed at bottom */}
          <div className="shrink-0">
            <ChatInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              disabled={status !== 'ready'}
              onStop={stop}
              isStreaming={status === 'streaming'}
              placeholder="Type your message..."
              messageHistory={messages
                .filter((msg) => msg.role === 'user')
                .map((msg) =>
                  msg.parts
                    ?.filter((p) => p.type === 'text')
                    .map((p) => ('text' in p ? p.text : ''))
                    .join('')
                )
                .reverse()}
              onShowKeyboardShortcuts={() => setIsKeyboardShortcutsOpen(true)}
            />
          </div>
        </div>
      </div>

      {/* Sidebar - Fixed height with internal scrolling */}
      <div className="drawer-side h-full">
        <label
          htmlFor="chat-drawer"
          aria-label="close sidebar"
          className="drawer-overlay"
        ></label>
        <ConversationList
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={handleSelectConversation}
          onDelete={handleDeleteConversation}
          onNew={handleNewChat}
        />
      </div>

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={isKeyboardShortcutsOpen}
        onClose={() => setIsKeyboardShortcutsOpen(false)}
      />
    </div>
  );
}

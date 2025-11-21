import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { useParams, useNavigate } from 'react-router';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from '@ai-sdk/react';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { useConfig } from '@/contexts/config';
import { useAccessTreeContext } from '@/contexts/access-tree';
import {
  MessageList,
  ChatInput,
  ConversationList,
  type Conversation,
} from '@/components/chat';
import { SidebarProjectDropdown } from '@/components/organisms/SidebarProjectDropdown';

export default function ChatSdkPage() {
  const { id: urlConversationId } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | undefined
  >();
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const { apiBase, buildHeaders } = useApi();
  const { showToast } = useToast();
  const { config, setActiveProject, setActiveOrg } = useConfig();
  const { refresh: refreshTree } = useAccessTreeContext();
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
        const data = await response.json();
        setConversations(data);
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
            })
          );

          // Load messages into the chat
          setMessages(formattedMessages);

          // Load draft text if conversation has no messages
          if (data.messages.length === 0 && data.draftText) {
            console.log('[ChatSDK] Loading draft text:', data.draftText);
            setInput(data.draftText);
          } else {
            setInput('');
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
    navigate(`/chat-sdk/${conv.id}`);
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
            navigate(`/chat-sdk/${mostRecentConvo.id}`, { replace: true });
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
              navigate(`/chat-sdk/${newConvo.id}`, { replace: true });
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
      navigate(`/chat-sdk/${data.id}`);
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
          navigate('/chat-sdk');
        }
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  return (
    <div className="drawer drawer-open h-screen">
      <input id="chat-drawer" type="checkbox" className="drawer-toggle" />

      {/* Main Content - Fixed layout with scrollable message area */}
      <div className="drawer-content flex flex-col h-screen overflow-hidden">
        <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full h-full overflow-hidden">
          {/* Header - Fixed at top */}
          <div className="flex-none p-4 border-b bg-base-100">
            <h1 className="text-2xl font-bold">Chat SDK (Vercel AI SDK v5)</h1>
            <p className="text-sm text-base-content/60">
              Powered by Vercel AI SDK + LangGraph + Vertex AI
            </p>
            {!config.activeProjectId && (
              <div className="mt-2 text-sm text-warning flex items-center gap-2">
                <span className="iconify lucide--alert-triangle"></span>
                <span>
                  No project selected - RAG search will not be available
                </span>
              </div>
            )}
          </div>

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
              />
            </div>
          )}

          {/* Error Display - Above input */}
          {error && (
            <div className="flex-none mx-4 mb-2 p-4 bg-error/10 border border-error/40 text-error rounded-lg">
              <strong>Error:</strong> {error.message || 'An error occurred'}
            </div>
          )}

          {/* Chat Input - Fixed at bottom */}
          <div className="flex-none">
            <ChatInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              disabled={status !== 'ready'}
              onStop={stop}
              isStreaming={status === 'streaming'}
              placeholder="Type your message..."
            />
          </div>
        </div>
      </div>

      {/* Sidebar - Fixed height with internal scrolling */}
      <div className="drawer-side h-screen">
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
          header={
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-base-content/60 uppercase tracking-wide">
                Active Project
              </h3>
              <SidebarProjectDropdown
                activeProjectId={config.activeProjectId}
                activeProjectName={config.activeProjectName}
                onSelectProject={(
                  projectId: string,
                  projectName: string,
                  orgId: string,
                  orgName: string
                ) => {
                  // Always set org first to ensure proper context
                  if (orgId !== config.activeOrgId) {
                    setActiveOrg(orgId, orgName);
                  }
                  setActiveProject(projectId, projectName);
                }}
                onAddOrganization={() => {
                  showToast({
                    message:
                      'Please use the admin layout to create organizations',
                    variant: 'info',
                    duration: 3000,
                  });
                }}
                onAddProject={() => {
                  showToast({
                    message: 'Please use the admin layout to create projects',
                    variant: 'info',
                    duration: 3000,
                  });
                }}
              />
            </div>
          }
        />
      </div>
    </div>
  );
}

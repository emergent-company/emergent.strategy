import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

// Helper function to format relative time
function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800)
    return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return date.toLocaleDateString();
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Fetch messages when conversationId changes
  useEffect(() => {
    if (conversationId) {
      fetchConversationMessages(conversationId);
    } else {
      setMessages([]);
    }
  }, [conversationId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Enter or Cmd+Enter to submit
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        const form = inputRef.current?.form;
        if (form) {
          form.requestSubmit();
        }
      }
      // Escape to clear input
      if (e.key === 'Escape') {
        if (inputRef.current) {
          inputRef.current.value = '';
          inputRef.current.blur();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/chat-ui/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (err) {
      console.error('Failed to fetch conversations', err);
    }
  };

  const fetchConversationMessages = async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chat-ui/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        // Transform backend messages to frontend format
        const formattedMessages = data.messages.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.createdAt,
        }));
        setMessages(formattedMessages);
      } else {
        throw new Error('Failed to fetch conversation');
      }
    } catch (err) {
      setError('Failed to load conversation history');
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  };

  const deleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this conversation?')) return;

    try {
      const res = await fetch(`/api/chat-ui/conversations/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (conversationId === id) {
          setConversationId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const startNewConversation = () => {
    setConversationId(null);
    setMessages([]);
    setError(null);
    inputRef.current?.focus();
  };

  const copyToClipboard = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const message = formData.get('message') as string;

    if (!message.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);
    setError(null);
    e.currentTarget.reset();

    // If this is the first message of a new conversation, we'll need to refresh the list later
    const isNewConversation = !conversationId;

    try {
      const response = await fetch('/api/chat-ui', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          conversationId: conversationId || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      let assistantMessage = '';
      const assistantId = Date.now().toString();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = new TextDecoder().decode(value);
        const lines = text.split('\n').filter((line) => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.type === 'text-delta') {
              assistantMessage += data.textDelta;
              setMessages((prev) => {
                const existing = prev.find((m) => m.id === assistantId);
                if (existing) {
                  return prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: assistantMessage }
                      : m
                  );
                }
                return [
                  ...prev,
                  {
                    id: assistantId,
                    role: 'assistant',
                    content: assistantMessage,
                    timestamp: new Date().toISOString(),
                  },
                ];
              });
            } else if (data.type === 'finish' && data.conversationId) {
              // Store conversationId for subsequent messages
              const newId = data.conversationId;
              setConversationId(newId);

              // If it was a new conversation, refresh the list to show the new title
              if (isNewConversation) {
                fetchConversations();
              }
            }
          } catch (e) {
            console.error('Failed to parse line:', line, e);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  // Filter conversations based on search query
  const filteredConversations = conversations.filter((conv) =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-base-200 overflow-hidden">
      {/* Sidebar */}
      <div
        className={`${
          isSidebarOpen ? 'w-80' : 'w-0'
        } bg-base-100 shadow-xl transition-all duration-300 ease-in-out flex flex-col border-r border-base-300 overflow-hidden`}
      >
        <div className="p-4 border-b border-base-300 flex justify-between items-center">
          <h2 className="font-bold text-lg">Conversations</h2>
          <button
            className="btn btn-square btn-ghost btn-sm"
            onClick={() => setIsSidebarOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-2">
          <button
            className="btn btn-primary w-full gap-2"
            onClick={startNewConversation}
          >
            <span>+</span> New Conversation
          </button>

          {/* Search input */}
          <input
            type="text"
            placeholder="Search conversations..."
            className="input input-bordered input-sm w-full"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredConversations.length === 0 ? (
            <div className="text-center text-base-content/40 py-8 text-sm">
              {searchQuery ? 'No matches found' : 'No history yet'}
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-base-200 transition-colors ${
                  conversationId === conv.id
                    ? 'bg-base-200 border-l-4 border-primary'
                    : ''
                }`}
                onClick={() => setConversationId(conv.id)}
              >
                <div className="flex-1 min-w-0 pr-2">
                  <div
                    className="font-medium truncate text-sm"
                    title={conv.title}
                  >
                    {conv.title || 'New Conversation'}
                  </div>
                  <div className="text-xs text-base-content/60">
                    {formatRelativeTime(conv.updatedAt)}
                  </div>
                </div>
                <button
                  className="btn btn-square btn-ghost btn-xs opacity-0 group-hover:opacity-100 text-error"
                  onClick={(e) => deleteConversation(e, conv.id)}
                  title="Delete conversation"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative">
        {/* Navbar */}
        <div className="navbar bg-base-100 shadow-sm z-10">
          <div className="flex-none">
            {!isSidebarOpen && (
              <button
                className="btn btn-square btn-ghost"
                onClick={() => setIsSidebarOpen(true)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  className="inline-block w-5 h-5 stroke-current"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 6h16M4 12h16M4 18h16"
                  ></path>
                </svg>
              </button>
            )}
          </div>
          <div className="flex-1">
            <a className="btn btn-ghost text-xl">Chat</a>
            {conversationId && (
              <div className="badge badge-success gap-2 ml-2 text-xs">
                Active
              </div>
            )}
          </div>
          <div className="flex-none">
            <div className="text-xs text-base-content/60 mr-4">
              <kbd className="kbd kbd-sm">Ctrl</kbd>+
              <kbd className="kbd kbd-sm">Enter</kbd> to send
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-base-200/50">
          {messages.length === 0 && !isLoading && (
            <div className="text-center text-base-content/60 mt-20">
              <div className="text-4xl mb-4">💬</div>
              <p className="text-lg font-medium">Start a new conversation</p>
              <p className="text-sm opacity-70">Ask me anything!</p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`chat ${
                message.role === 'user' ? 'chat-end' : 'chat-start'
              }`}
            >
              <div className="chat-image avatar">
                <div className="w-10 rounded-full">
                  {message.role === 'user' ? (
                    <div className="bg-neutral text-neutral-content w-full h-full flex items-center justify-center text-sm font-bold">
                      ME
                    </div>
                  ) : (
                    <div className="bg-primary text-primary-content w-full h-full flex items-center justify-center text-sm font-bold">
                      AI
                    </div>
                  )}
                </div>
              </div>
              <div className="chat-header opacity-50 text-xs mb-1 flex items-center gap-2">
                <span>{message.role === 'user' ? 'You' : 'Assistant'}</span>
                {message.timestamp && (
                  <time className="text-xs opacity-70">
                    {formatRelativeTime(message.timestamp)}
                  </time>
                )}
              </div>
              <div
                className={`chat-bubble ${
                  message.role === 'user'
                    ? 'chat-bubble-primary text-primary-content'
                    : 'chat-bubble-base-100 bg-base-100 shadow-sm text-base-content'
                }`}
              >
                {message.role === 'user' ? (
                  <div className="whitespace-pre-wrap">{message.content}</div>
                ) : (
                  <div className="prose prose-sm max-w-none prose-neutral dark:prose-invert">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        code(props) {
                          const { children, className, ...rest } = props;
                          const match = /language-(\w+)/.exec(className || '');
                          const isInline = !match;

                          return !isInline ? (
                            <SyntaxHighlighter
                              style={oneDark as any}
                              language={match[1]}
                              PreTag="div"
                            >
                              {String(children).replace(/\n$/, '')}
                            </SyntaxHighlighter>
                          ) : (
                            <code className={className} {...rest}>
                              {children}
                            </code>
                          );
                        },
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
              {message.role === 'assistant' && (
                <div className="chat-footer opacity-0 hover:opacity-100 transition-opacity">
                  <button
                    className="btn btn-xs btn-ghost gap-1"
                    onClick={() => copyToClipboard(message.content, message.id)}
                    title="Copy to clipboard"
                  >
                    {copiedMessageId === message.id ? (
                      <>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3 w-3"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-3 w-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="chat chat-start">
              <div className="chat-image avatar">
                <div className="w-10 rounded-full">
                  <div className="bg-primary text-primary-content w-full h-full flex items-center justify-center text-sm font-bold">
                    AI
                  </div>
                </div>
              </div>
              <div className="chat-header opacity-50 text-xs mb-1">
                Assistant
              </div>
              <div className="chat-bubble bg-base-100 shadow-sm">
                <span className="loading loading-dots loading-sm"></span>
              </div>
            </div>
          )}

          {error && (
            <div className="alert alert-error mx-auto max-w-md my-4 shadow-lg">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="stroke-current shrink-0 h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-base-100 border-t border-base-300">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative">
            <div className="join w-full shadow-sm">
              <input
                ref={inputRef}
                type="text"
                name="message"
                placeholder="Type your message..."
                className="input input-bordered join-item flex-1 focus:outline-none"
                disabled={isLoading}
                autoComplete="off"
              />
              <button
                type="submit"
                className="btn btn-primary join-item"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="loading loading-spinner"></span>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                  </svg>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

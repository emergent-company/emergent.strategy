import {
  useState,
  useRef,
  useEffect,
  useCallback,
  FormEvent,
  KeyboardEvent,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import {
  SuggestionCard,
  stripSuggestionsFromContent,
  formatTimestamp,
} from '@/components/chat';
import { useObjectRefinementChat } from '@/hooks/use-object-refinement-chat';
import type { RefinementMessage } from '@/types/object-refinement';

export interface ObjectRefinementChatProps {
  /** The object ID to chat about */
  objectId: string;
  /** Object name for display */
  objectName: string;
  /** Callback when object data may have changed (after applying suggestion) */
  onObjectUpdated?: (newVersion: number) => void;
}

/**
 * ObjectRefinementChat - AI-assisted chat for refining graph object data
 *
 * Features:
 * - Streaming chat with AI assistant
 * - Display suggestions with accept/reject actions
 * - Optimistic UI updates
 * - Message history with timestamps
 */
export function ObjectRefinementChat({
  objectId,
  objectName,
  onObjectUpdated,
}: ObjectRefinementChatProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    isLoading,
    isStreaming,
    error,
    send,
    stop,
    applySuggestion,
    rejectSuggestion,
  } = useObjectRefinementChat({
    objectId,
    onObjectUpdated,
    pollInterval: 10000, // Poll every 10 seconds for shared chat updates
  });

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [inputValue]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim() || isStreaming) return;

      const message = inputValue.trim();
      setInputValue('');
      await send(message);
    },
    [inputValue, isStreaming, send]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit(e as unknown as FormEvent);
      }
    },
    [handleSubmit]
  );

  const handleApplySuggestion = useCallback(
    async (messageId: string, suggestionIndex: number) => {
      const result = await applySuggestion(messageId, suggestionIndex);
      if (!result.success && result.error) {
        console.error('Failed to apply suggestion:', result.error);
      }
    },
    [applySuggestion]
  );

  const handleRejectSuggestion = useCallback(
    async (messageId: string, suggestionIndex: number) => {
      const result = await rejectSuggestion(messageId, suggestionIndex);
      if (!result.success && result.error) {
        console.error('Failed to reject suggestion:', result.error);
      }
    },
    [rejectSuggestion]
  );

  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-base-300">
        <div className="flex items-center gap-2">
          <Icon icon="lucide--sparkles" className="size-5 text-primary" />
          <div>
            <h3 className="font-semibold text-sm">Refinement Chat</h3>
            <p className="text-xs text-base-content/60 truncate max-w-[200px]">
              Improve {objectName}
            </p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Empty State */}
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center text-base-content/60 py-8">
            <Icon
              icon="lucide--message-square-plus"
              className="size-12 mb-3 opacity-40"
            />
            <p className="text-sm font-medium mb-1">Start a conversation</p>
            <p className="text-xs max-w-[200px]">
              Ask the AI to help refine this object's properties or
              relationships.
            </p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && messages.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <Spinner size="md" className="text-primary" />
          </div>
        )}

        {/* Messages */}
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            onApplySuggestion={handleApplySuggestion}
            onRejectSuggestion={handleRejectSuggestion}
          />
        ))}

        {/* Streaming Indicator */}
        {isStreaming && (
          <div className="flex items-center gap-2 text-xs text-base-content/60">
            <span className="loading loading-dots loading-xs"></span>
            <span>AI is thinking...</span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="alert alert-error text-sm py-2">
            <Icon icon="lucide--alert-circle" className="size-4" />
            <span>{error}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="shrink-0 px-4 py-3 border-t border-base-300">
        <form onSubmit={handleSubmit}>
          <div className="flex items-end gap-2 bg-base-200 rounded-lg p-2">
            <textarea
              ref={textareaRef}
              className="flex-1 bg-transparent border-none outline-none focus:outline-none placeholder:text-base-content/40 resize-none min-h-[28px] max-h-[120px] text-sm"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about this object..."
              disabled={isStreaming}
              rows={1}
            />
            {isStreaming ? (
              <button
                type="button"
                className="btn btn-error btn-circle btn-sm"
                onClick={stop}
                aria-label="Stop generating"
              >
                <Icon icon="lucide--square" className="size-4" />
              </button>
            ) : (
              <button
                type="submit"
                className="btn btn-primary btn-circle btn-sm"
                disabled={!inputValue.trim()}
                aria-label="Send message"
              >
                <Icon icon="lucide--send-horizontal" className="size-4" />
              </button>
            )}
          </div>
          <div className="mt-1 text-xs text-base-content/40">
            <kbd className="kbd kbd-xs">Enter</kbd> to send
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Message Item Component ---

interface MessageItemProps {
  message: RefinementMessage;
  onApplySuggestion: (messageId: string, suggestionIndex: number) => void;
  onRejectSuggestion: (messageId: string, suggestionIndex: number) => void;
}

function MessageItem({
  message,
  onApplySuggestion,
  onRejectSuggestion,
}: MessageItemProps) {
  const isAssistant = message.role === 'assistant';

  const formattedTime = formatTimestamp(message.createdAt);

  return (
    <div className={`chat ${isAssistant ? 'chat-start' : 'chat-end'}`}>
      {/* Avatar for assistant */}
      {isAssistant && (
        <div className="chat-image">
          <div className="bg-primary/10 text-primary flex items-center justify-center rounded-full size-8">
            <Icon icon="lucide--sparkles" className="size-4" />
          </div>
        </div>
      )}

      {/* Message Bubble */}
      <div
        className={`chat-bubble ${
          isAssistant
            ? 'bg-base-200 text-base-content'
            : 'bg-primary text-primary-content'
        } max-w-[85%]`}
      >
        {isAssistant ? (
          <div className="prose prose-sm max-w-none prose-neutral dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {stripSuggestionsFromContent(message.content)}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-sm">{message.content}</div>
        )}

        {/* Suggestions */}
        {message.suggestions && message.suggestions.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.suggestions.map((suggestion, idx) => (
              <SuggestionCard
                key={idx}
                suggestion={suggestion}
                onApply={() => onApplySuggestion(message.id, idx)}
                onReject={() => onRejectSuggestion(message.id, idx)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <div className="chat-footer opacity-50 text-xs mt-1">{formattedTime}</div>
    </div>
  );
}

export default ObjectRefinementChat;

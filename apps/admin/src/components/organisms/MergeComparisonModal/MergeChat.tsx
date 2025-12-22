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
  type UnifiedSuggestion,
} from '@/components/chat';
import { useMergeChat } from '@/hooks/use-merge-chat';
import type { MergeChatMessage, MergeChatSuggestion } from '@/types/merge-chat';

export interface MergeChatProps {
  /** The task ID for the merge suggestion */
  taskId: string;
  /** Source object ID */
  sourceObjectId: string;
  /** Target object ID */
  targetObjectId: string;
  /** Source object name for display */
  sourceObjectName: string;
  /** Target object name for display */
  targetObjectName: string;
  /** Callback when a suggestion is applied */
  onSuggestionApplied?: (propertyKey: string, value: unknown) => void;
}

/**
 * MergeChat - AI-assisted chat for merging two graph objects
 *
 * Features:
 * - Streaming chat with AI assistant
 * - Display merge suggestions with accept/reject actions
 * - Optimistic UI updates
 * - Message history with timestamps
 * - Initial system message explaining the merge context
 */
export function MergeChat({
  taskId,
  sourceObjectId,
  targetObjectId,
  sourceObjectName,
  targetObjectName,
  onSuggestionApplied,
}: MergeChatProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Track if we've already sent the initial auto-prompt (to prevent double-send)
  const hasSentInitialPrompt = useRef(false);

  const {
    messages,
    isLoading,
    isStreaming,
    error,
    isNewConversation,
    send,
    stop,
    applySuggestion,
    rejectSuggestion,
  } = useMergeChat({
    taskId,
    sourceObjectId,
    targetObjectId,
    pollInterval: 10000,
  });

  // Auto-send initial prompt for new conversations (only once)
  useEffect(() => {
    // Only send if:
    // 1. It's a new conversation (no messages from server)
    // 2. We're not currently loading
    // 3. We haven't already sent the initial prompt
    // 4. We're not already streaming
    if (
      isNewConversation &&
      !isLoading &&
      !hasSentInitialPrompt.current &&
      !isStreaming
    ) {
      hasSentInitialPrompt.current = true;
      const initialPrompt = `Please analyze the differences between "${sourceObjectName}" and "${targetObjectName}" and suggest how to merge them. For each property that differs, provide a recommendation on which value to keep or how to combine them.`;
      send(initialPrompt);
    }
  }, [
    isNewConversation,
    isLoading,
    isStreaming,
    sourceObjectName,
    targetObjectName,
    send,
  ]);

  // Reset the initial prompt flag when taskId changes (new modal opened)
  useEffect(() => {
    hasSentInitialPrompt.current = false;
  }, [taskId]);

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
    async (
      messageId: string,
      suggestionIndex: number,
      suggestion: MergeChatSuggestion
    ) => {
      const result = await applySuggestion(messageId, suggestionIndex);
      if (result.success) {
        onSuggestionApplied?.(
          suggestion.propertyKey,
          suggestion.suggestedValue
        );
      } else if (result.error) {
        console.error('Failed to apply merge suggestion:', result.error);
      }
    },
    [applySuggestion, onSuggestionApplied]
  );

  const handleRejectSuggestion = useCallback(
    async (messageId: string, suggestionIndex: number) => {
      const result = await rejectSuggestion(messageId, suggestionIndex);
      if (!result.success && result.error) {
        console.error('Failed to reject merge suggestion:', result.error);
      }
    },
    [rejectSuggestion]
  );

  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-base-300">
        <div className="flex items-center gap-2">
          <Icon icon="lucide--git-merge" className="size-5 text-warning" />
          <div>
            <h3 className="font-semibold text-sm">Merge Assistant</h3>
            <p className="text-xs text-base-content/60 truncate max-w-[200px]">
              Help merge these objects
            </p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Loading State - shown while loading conversation from server */}
        {isLoading && messages.length === 0 && (
          <div className="flex items-center justify-center py-8">
            <Spinner size="md" className="text-warning" />
          </div>
        )}

        {/* Messages */}
        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            onApplySuggestion={(idx, suggestion) =>
              handleApplySuggestion(message.id, idx, suggestion)
            }
            onRejectSuggestion={(idx) =>
              handleRejectSuggestion(message.id, idx)
            }
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
              placeholder="Ask about the merge..."
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
                className="btn btn-warning btn-circle btn-sm"
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
  message: MergeChatMessage;
  onApplySuggestion: (
    suggestionIndex: number,
    suggestion: MergeChatSuggestion
  ) => void;
  onRejectSuggestion: (suggestionIndex: number) => void;
}

function MessageItem({
  message,
  onApplySuggestion,
  onRejectSuggestion,
}: MessageItemProps) {
  const isAssistant = message.role === 'assistant';
  const isSystem = message.role === 'system';

  const formattedTime = formatTimestamp(message.createdAt);

  if (isSystem) {
    return (
      <div className="text-center">
        <span className="badge badge-ghost badge-sm text-xs">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={`chat ${isAssistant ? 'chat-start' : 'chat-end'}`}>
      {/* Avatar for assistant */}
      {isAssistant && (
        <div className="chat-image">
          <div className="bg-warning/10 text-warning flex items-center justify-center rounded-full size-8">
            <Icon icon="lucide--bot" className="size-4" />
          </div>
        </div>
      )}

      {/* Message Bubble */}
      <div
        className={`chat-bubble ${
          isAssistant
            ? 'bg-base-200 text-base-content'
            : 'bg-warning text-warning-content'
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

        {/* Merge Suggestions - Using shared SuggestionCard */}
        {message.suggestions && message.suggestions.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.suggestions.map((suggestion, idx) => (
              <SuggestionCard
                key={idx}
                suggestion={convertToUnifiedSuggestion(suggestion)}
                onApply={() => onApplySuggestion(idx, suggestion)}
                onReject={() => onRejectSuggestion(idx)}
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

/**
 * Convert MergeChatSuggestion to UnifiedSuggestion format
 */
function convertToUnifiedSuggestion(
  suggestion: MergeChatSuggestion
): UnifiedSuggestion {
  return {
    index: suggestion.index,
    type: suggestion.type,
    explanation: suggestion.explanation,
    status: suggestion.status,
    propertyKey: suggestion.propertyKey,
    sourceValue: suggestion.sourceValue,
    targetValue: suggestion.targetValue,
    suggestedValue: suggestion.suggestedValue,
  };
}

export default MergeChat;

import { useEffect, useRef, memo, Fragment } from 'react';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import type { UIMessage } from '@ai-sdk/react';
import { format } from 'date-fns';
import { MessageBubble } from './MessageBubble';
import type { ActionTarget } from './ActionCard';
import type { RefinementSuggestion } from '@/types/object-refinement';

/**
 * Check if two dates are on the same calendar day
 */
const isSameDay = (date1: Date, date2: Date): boolean => {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
};

/**
 * Format day divider text: "Today", "Yesterday", or full date
 */
const formatDayDivider = (date: Date): string => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(date, today)) {
    return 'Today';
  } else if (isSameDay(date, yesterday)) {
    return 'Yesterday';
  } else {
    return format(date, 'EEEE, MMMM d, yyyy'); // "Monday, November 20, 2025"
  }
};

interface MessageListProps {
  messages: UIMessage[];
  onCopy?: (content: string) => void;
  onRegenerate?: () => void;
  onThumbsUp?: () => void;
  onThumbsDown?: () => void;
  emptyState?: React.ReactNode;
  isStreaming?: boolean;
  /** Function to get suggestions for a message by its ID */
  getSuggestions?: (messageId: string) => RefinementSuggestion[] | undefined;
  /** Optional target object for ActionCard display in suggestions */
  actionTarget?: ActionTarget;
  /** Callback when a suggestion is applied */
  onApplySuggestion?: (messageId: string, suggestionIndex: number) => void;
  /** Callback when a suggestion is rejected */
  onRejectSuggestion?: (messageId: string, suggestionIndex: number) => void;
  /** Currently loading suggestion (messageId and suggestionIndex) */
  loadingSuggestion?: { messageId: string; suggestionIndex: number } | null;
}

/**
 * MessageList - Scrollable message container with SimpleBar
 *
 * Features:
 * - Smooth scrolling with SimpleBar
 * - Auto-scroll to bottom on new messages
 * - Empty state support
 * - Loading indicator during streaming
 * - Renders MessageBubble components for each message
 */
export const MessageList = memo(function MessageList({
  messages,
  onCopy,
  onRegenerate,
  onThumbsUp,
  onThumbsDown,
  emptyState,
  isStreaming = false,
  getSuggestions,
  actionTarget,
  onApplySuggestion,
  onRejectSuggestion,
  loadingSuggestion,
}: MessageListProps) {
  const scrollRef = useRef<any>(null);
  const contentEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive or during streaming
  useEffect(() => {
    // Use the content end marker to scroll into view
    if (contentEndRef.current) {
      contentEndRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'end',
      });
    }
  }, [messages, isStreaming]); // Watch entire messages array to catch streaming updates

  return (
    <SimpleBar
      className="flex-1 px-4 py-2"
      ref={scrollRef}
      style={{ maxHeight: '100%' }}
    >
      <div className="space-y-6 pb-12">
        {messages.length === 0 && !isStreaming
          ? emptyState || (
              <div className="text-center text-base-content/50 py-8">
                Start a conversation...
              </div>
            )
          : messages
              .filter((message) => {
                // Filter out empty assistant messages during streaming
                // The loading indicator will show instead
                if (isStreaming && message.role === 'assistant') {
                  const textContent = message.parts
                    ?.filter((part) => part.type === 'text')
                    .map((part) => ('text' in part ? part.text : ''))
                    .join('');
                  return textContent && textContent.trim().length > 0;
                }
                return true;
              })
              .map((message, index, filteredMessages) => {
                // Determine if we should show a day divider before this message
                const showDayDivider = (() => {
                  if (index === 0) return true; // Always show for first message

                  const currentDate = (message as any).createdAt
                    ? new Date((message as any).createdAt)
                    : null;
                  const previousMessage = filteredMessages[index - 1];
                  const previousDate =
                    previousMessage && (previousMessage as any).createdAt
                      ? new Date((previousMessage as any).createdAt)
                      : null;

                  if (!currentDate || !previousDate) return false;

                  return !isSameDay(currentDate, previousDate);
                })();

                return (
                  <Fragment key={message.id}>
                    {showDayDivider && (message as any).createdAt && (
                      <div className="flex items-center gap-4 py-4">
                        <div className="flex-1 border-t border-base-300"></div>
                        <div className="text-base-content/50 text-xs font-medium uppercase tracking-wider">
                          {formatDayDivider(
                            new Date((message as any).createdAt)
                          )}
                        </div>
                        <div className="flex-1 border-t border-base-300"></div>
                      </div>
                    )}
                    <MessageBubble
                      key={message.id}
                      message={message}
                      createdAt={(message as any).createdAt}
                      onCopy={onCopy}
                      onRegenerate={
                        message.role === 'assistant' ? onRegenerate : undefined
                      }
                      onThumbsUp={
                        message.role === 'assistant' ? onThumbsUp : undefined
                      }
                      onThumbsDown={
                        message.role === 'assistant' ? onThumbsDown : undefined
                      }
                      suggestions={
                        message.role === 'assistant' && getSuggestions
                          ? getSuggestions(message.id)
                          : undefined
                      }
                      actionTarget={
                        message.role === 'assistant' ? actionTarget : undefined
                      }
                      onApplySuggestion={
                        message.role === 'assistant' && onApplySuggestion
                          ? (idx) => onApplySuggestion(message.id, idx)
                          : undefined
                      }
                      onRejectSuggestion={
                        message.role === 'assistant' && onRejectSuggestion
                          ? (idx) => onRejectSuggestion(message.id, idx)
                          : undefined
                      }
                      loadingSuggestionIndex={
                        loadingSuggestion?.messageId === message.id
                          ? loadingSuggestion.suggestionIndex
                          : undefined
                      }
                    />
                  </Fragment>
                );
              })}

        {/* Loading indicator while streaming */}
        {isStreaming && (
          <div className="chat chat-start">
            <div className="chat-image bg-primary/5 text-primary border-primary/10 flex items-center justify-center rounded-full border p-2">
              <span className="iconify lucide--bot size-6"></span>
            </div>
            <div className="chat-bubble bg-base-200">
              <span className="loading loading-dots loading-sm"></span>
            </div>
          </div>
        )}

        {/* Invisible marker at the end for auto-scroll */}
        <div ref={contentEndRef} />
      </div>
    </SimpleBar>
  );
});

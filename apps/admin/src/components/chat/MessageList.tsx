import { useEffect, useRef, memo } from 'react';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import type { UIMessage } from '@ai-sdk/react';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: UIMessage[];
  onCopy?: (content: string) => void;
  onRegenerate?: () => void;
  onThumbsUp?: () => void;
  onThumbsDown?: () => void;
  emptyState?: React.ReactNode;
  isStreaming?: boolean;
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
              .map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}
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
                />
              ))}

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

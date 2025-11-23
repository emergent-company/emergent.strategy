import { memo } from 'react';
import type { UIMessage } from '@ai-sdk/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { format, isToday, isYesterday, differenceInHours } from 'date-fns';
import { UrlBadge } from './UrlBadge';
import { ObjectCard } from './ObjectCard';

interface MessageBubbleProps {
  message: UIMessage;
  onCopy?: (content: string) => void;
  onRegenerate?: () => void;
  onThumbsUp?: () => void;
  onThumbsDown?: () => void;
  showActions?: boolean;
  createdAt?: Date | string;
}

/**
 * MessageBubble - Polished chat message component adapted from Nexus ContentItem
 *
 * Features:
 * - User/Assistant message styling with DaisyUI chat classes
 * - Bot avatar for assistant messages
 * - Hover-revealed action toolbar (copy, regenerate, feedback)
 * - Relative timestamp in footer
 * - Supports AI SDK UIMessage format
 * - Markdown rendering with syntax highlighting for assistant messages
 * - Plain text rendering for user messages
 * - Renders @[key] and [[key|name]] as ObjectCards
 */
export const MessageBubble = memo(
  function MessageBubble({
    message,
    onCopy,
    onRegenerate,
    onThumbsUp,
    onThumbsDown,
    showActions = true,
    createdAt,
  }: MessageBubbleProps) {
    const isAssistant = message.role === 'assistant';

    // Extract text content from message parts
    const getTextContent = (): string => {
      if (!message.parts) return '';
      return message.parts
        .filter((part) => part.type === 'text')
        .map((part) => ('text' in part ? part.text : ''))
        .join('');
    };

    // Process content to convert specific graph syntax to markdown links
    // @[key] -> [key](key)
    // @[key|name] -> [name](key)
    // [[key|name]] -> [name](key)
    // [[key]] -> [key](key)
    const processContent = (content: string): string => {
      return content
        .replace(/@\[([^|\]]+)\|([^\]]+)\]/g, '[$2]($1)')
        .replace(/@\[([^\]]+)\]/g, '[$1]($1)')
        .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '[$2]($1)')
        .replace(/\[\[([^|\]]+)\]\]/g, '[$1]($1)');
    };

    const textContent = processContent(getTextContent());

    // Format timestamp with new algorithm:
    // - Less than 5 hours ago: "X hours ago"
    // - More than 5 hours but today: time only (e.g., "3:45 PM")
    // - Yesterday: time only (e.g., "3:45 PM")
    // - Before yesterday: full date and time (e.g., "Nov 20, 2025 3:45 PM")
    const getFormattedTime = (): string => {
      if (!createdAt) {
        return 'just now';
      }

      try {
        const date =
          typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
        const now = new Date();
        const hoursAgo = differenceInHours(now, date);

        // Less than 5 hours ago: show relative time
        if (hoursAgo < 5) {
          if (hoursAgo === 0) {
            return 'just now';
          } else if (hoursAgo === 1) {
            return '1 hour ago';
          } else {
            return `${hoursAgo} hours ago`;
          }
        }

        // Yesterday or today (but more than 5 hours ago): show time only
        if (isToday(date) || isYesterday(date)) {
          return format(date, 'h:mm a'); // "3:45 PM"
        }

        // Before yesterday: show full date and time
        return format(date, 'MMM d, yyyy h:mm a'); // "Nov 20, 2025 3:45 PM"
      } catch (error) {
        console.error('Error formatting timestamp:', error);
        return 'just now';
      }
    };

    const formattedTime = getFormattedTime();

    const handleCopy = () => {
      navigator.clipboard.writeText(textContent);
      onCopy?.(textContent);
    };

    return isAssistant ? (
      <div className="chat chat-start group">
        {/* Bot Avatar */}
        <div className="chat-image bg-primary/5 text-primary border-primary/10 flex items-center justify-center rounded-full border p-2">
          <span className="iconify lucide--bot size-6"></span>
        </div>

        {/* Message Bubble */}
        <div className="chat-bubble bg-base-200 relative p-4">
          {/* Render markdown with syntax highlighting for assistant */}
          <div className="prose prose-sm max-w-none prose-neutral dark:prose-invert">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Custom link renderer to display URLs as badges and object references as cards
                a(props) {
                  const { href, children } = props;
                  if (!href) return <a {...props}>{children}</a>;

                  // Check if it's a standard URL
                  const isUrl = /^(https?:\/\/|mailto:|tel:)/.test(href);
                  const childText =
                    typeof children === 'string' ? children : null;

                  if (isUrl) {
                    // Render URL as badge component
                    const title =
                      childText && childText !== href ? childText : undefined;
                    return <UrlBadge url={href} title={title} />;
                  } else {
                    // Assume it's an object reference
                    // href is likely the key (e.g. "TASK-123") or "obj:key"
                    // childText is the name
                    return (
                      <ObjectCard
                        objectKey={href.replace(/^obj:/, '')}
                        name={childText || href}
                      />
                    );
                  }
                },
                // Syntax highlighting for code blocks
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
              {textContent}
            </ReactMarkdown>
          </div>

          {/* Action Toolbar - Appears on Hover */}
          {showActions && (
            <div className="border-base-300 bg-base-100 absolute end-2 -bottom-8 z-10 flex scale-90 items-center gap-1.5 rounded-full border px-3 py-2 opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100">
              {onRegenerate && (
                <button
                  className="btn btn-xs"
                  onClick={onRegenerate}
                  aria-label="Regenerate response"
                >
                  Regenerate
                </button>
              )}
              <button
                className="btn btn-xs"
                onClick={handleCopy}
                aria-label="Copy to clipboard"
              >
                Copy
              </button>
              {onThumbsDown && (
                <button
                  className="btn btn-xs btn-ghost btn-error btn-circle"
                  onClick={onThumbsDown}
                  aria-label="Thumbs down"
                >
                  <span className="iconify lucide--thumbs-down size-3.5"></span>
                </button>
              )}
              {onThumbsUp && (
                <button
                  className="btn btn-xs btn-ghost btn-success btn-circle"
                  onClick={onThumbsUp}
                  aria-label="Thumbs up"
                >
                  <span className="iconify lucide--thumbs-up size-3.5"></span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Timestamp Footer */}
        <div className="chat-footer opacity-50 mt-2">{formattedTime}</div>
      </div>
    ) : (
      // User Message (simpler, right-aligned, plain text)
      <div className="chat chat-end">
        <div className="chat-bubble bg-base-200 p-4">
          <div className="whitespace-pre-wrap">{textContent}</div>
        </div>
        <div className="chat-footer opacity-50 mt-2">{formattedTime}</div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison to optimize performance
    // Only re-render if message data or functionality changes

    // If message object is the same reference, check other props
    if (prevProps.message === nextProps.message) {
      return (
        prevProps.showActions === nextProps.showActions &&
        prevProps.createdAt === nextProps.createdAt &&
        prevProps.onCopy === nextProps.onCopy &&
        prevProps.onRegenerate === nextProps.onRegenerate &&
        prevProps.onThumbsUp === nextProps.onThumbsUp &&
        prevProps.onThumbsDown === nextProps.onThumbsDown
      );
    }

    // If message object is different, check if content is effectively the same
    // This handles the case where ai-sdk might return new objects for same messages
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.message.role === nextProps.message.role &&
      // Check parts if they exist (shallow comparison of array reference)
      prevProps.message.parts === nextProps.message.parts &&
      prevProps.createdAt === nextProps.createdAt &&
      prevProps.showActions === nextProps.showActions
    );
  }
);

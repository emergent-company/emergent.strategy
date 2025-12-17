import { memo } from 'react';
import type { UIMessage } from '@ai-sdk/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { UrlBadge } from './UrlBadge';
import { ObjectCard } from './ObjectCard';
import { SuggestionCard } from './SuggestionCard';
import { ActionCard, type ActionTarget } from './ActionCard';
import { ToolCallList, type ToolCallInfo } from './ToolCallIndicator';
import { stripSuggestionsFromContent, formatTimestamp } from './utils';
import type { RefinementSuggestion } from '@/types/object-refinement';

interface MessageBubbleProps {
  message: UIMessage;
  onCopy?: (content: string) => void;
  onRegenerate?: () => void;
  onThumbsUp?: () => void;
  onThumbsDown?: () => void;
  showActions?: boolean;
  createdAt?: Date | string;
  /** Optional suggestions to render within assistant messages */
  suggestions?: RefinementSuggestion[];
  /** Optional target object for ActionCard display (shows object context in suggestions) */
  actionTarget?: ActionTarget;
  /** Callback when a suggestion is applied */
  onApplySuggestion?: (suggestionIndex: number) => void;
  /** Callback when a suggestion is rejected */
  onRejectSuggestion?: (suggestionIndex: number) => void;
  /** Index of the suggestion currently being processed (for loading state) */
  loadingSuggestionIndex?: number;
  /** Callback when an object card is clicked, passes the objectId */
  onObjectClick?: (objectId: string) => void;
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
    suggestions,
    actionTarget,
    onApplySuggestion,
    onRejectSuggestion,
    loadingSuggestionIndex,
    onObjectClick,
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

    // Extract tool calls from message parts
    // Tool parts have type like "tool-{toolName}" or "dynamic-tool"
    const getToolCalls = (): ToolCallInfo[] => {
      if (!message.parts) return [];
      return message.parts
        .filter((part) => {
          // Check for tool-* types or dynamic-tool
          return part.type.startsWith('tool-') || part.type === 'dynamic-tool';
        })
        .map((part) => {
          const toolPart = part as {
            type: string;
            toolName?: string;
            toolCallId: string;
            state: 'partial-call' | 'call' | 'result';
            args?: unknown;
            result?: unknown;
          };
          // For tool-{name} types, extract the tool name from the type
          const toolName =
            toolPart.toolName ||
            (toolPart.type.startsWith('tool-')
              ? toolPart.type.replace('tool-', '')
              : toolPart.type);
          return {
            toolName,
            toolCallId: toolPart.toolCallId,
            state: toolPart.state,
            args: toolPart.args,
            result: toolPart.result,
          };
        });
    };

    const toolCalls = getToolCalls();

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

    const rawContent = processContent(getTextContent());
    // Strip suggestion blocks for assistant messages to avoid showing raw JSON
    const textContent =
      message.role === 'assistant'
        ? stripSuggestionsFromContent(rawContent)
        : rawContent;

    // Format timestamp with new algorithm:
    // - Less than 5 hours ago: "X hours ago"
    // - More than 5 hours but today: time only (e.g., "3:45 PM")
    // - Yesterday: time only (e.g., "3:45 PM")
    // - Before yesterday: full date and time (e.g., "Nov 20, 2025 3:45 PM")
    const formattedTime = createdAt ? formatTimestamp(createdAt) : 'just now';

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
          {/* Tool Calls - Show what tools were used */}
          {toolCalls.length > 0 && <ToolCallList toolCalls={toolCalls} />}

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
                        onClick={onObjectClick}
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

          {/* Suggestions - Use ActionCard when target is provided, otherwise SuggestionCard */}
          {suggestions && suggestions.length > 0 && (
            <div className="mt-3 space-y-2">
              {suggestions.map((suggestion, idx) =>
                actionTarget ? (
                  <ActionCard
                    key={idx}
                    suggestion={suggestion}
                    target={actionTarget}
                    onApply={
                      onApplySuggestion
                        ? () => onApplySuggestion(idx)
                        : undefined
                    }
                    onReject={
                      onRejectSuggestion
                        ? () => onRejectSuggestion(idx)
                        : undefined
                    }
                    isLoading={loadingSuggestionIndex === idx}
                  />
                ) : (
                  <SuggestionCard
                    key={idx}
                    suggestion={suggestion}
                    onApply={
                      onApplySuggestion
                        ? () => onApplySuggestion(idx)
                        : undefined
                    }
                    onReject={
                      onRejectSuggestion
                        ? () => onRejectSuggestion(idx)
                        : undefined
                    }
                  />
                )
              )}
            </div>
          )}

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
        prevProps.onThumbsDown === nextProps.onThumbsDown &&
        prevProps.suggestions === nextProps.suggestions &&
        prevProps.actionTarget === nextProps.actionTarget &&
        prevProps.onApplySuggestion === nextProps.onApplySuggestion &&
        prevProps.onRejectSuggestion === nextProps.onRejectSuggestion &&
        prevProps.loadingSuggestionIndex === nextProps.loadingSuggestionIndex &&
        prevProps.onObjectClick === nextProps.onObjectClick
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
      prevProps.showActions === nextProps.showActions &&
      prevProps.suggestions === nextProps.suggestions &&
      prevProps.actionTarget === nextProps.actionTarget &&
      prevProps.loadingSuggestionIndex === nextProps.loadingSuggestionIndex &&
      prevProps.onObjectClick === nextProps.onObjectClick
    );
  }
);

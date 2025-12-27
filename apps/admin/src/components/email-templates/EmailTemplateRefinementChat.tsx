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
import { CodeDiffViewer } from '@/components/organisms/CodeDiffViewer';
import { formatTimestamp } from '@/components/chat';
import {
  useEmailTemplateRefinementChat,
  type EmailTemplateRefinementMessage,
  type EmailTemplateSuggestion,
} from '@/hooks/use-email-template-refinement-chat';
import { useApi } from '@/hooks/use-api';
import {
  previewCustomMjml,
  MjmlPreviewResponse,
} from '@/hooks/use-superadmin-templates';

export interface EmailTemplateRefinementChatProps {
  /** The template ID to chat about */
  templateId: string;
  /** Template name for display */
  templateName: string;
  /** Current MJML content to include in context */
  currentMjml: string;
  /** Current subject template to include in context */
  currentSubject: string;
  /** Current version number for detecting stale suggestions */
  currentVersionNumber?: number;
  /** Sample data for rendering Handlebars variables in preview */
  sampleData?: Record<string, unknown>;
  /** Callback when template data may have changed (after applying suggestion) */
  onTemplateUpdated?: (newVersion: number) => void;
}

/**
 * EmailTemplateRefinementChat - AI-assisted chat for refining email templates
 *
 * Features:
 * - Streaming chat with AI assistant
 * - Display suggestions for MJML and subject changes
 * - Apply suggestions to create new template versions
 * - Message history with timestamps
 */
export function EmailTemplateRefinementChat({
  templateId,
  templateName,
  currentMjml,
  currentSubject,
  currentVersionNumber,
  sampleData,
  onTemplateUpdated,
}: EmailTemplateRefinementChatProps) {
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
  } = useEmailTemplateRefinementChat({
    templateId,
    currentMjml,
    currentSubject,
    onTemplateUpdated,
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
    async (
      messageId: string,
      suggestion: EmailTemplateSuggestion
    ): Promise<ApplyResult> => {
      const result = await applySuggestion(
        messageId,
        suggestion.index,
        suggestion.type,
        suggestion.newContent,
        'Applied from AI suggestion'
      );
      if (!result.success && result.error) {
        console.error('Failed to apply suggestion:', result.error);
      }
      return { success: result.success, error: result.error };
    },
    [applySuggestion]
  );

  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-base-300">
        <div className="flex items-center gap-2">
          <Icon icon="lucide--sparkles" className="size-5 text-primary" />
          <div>
            <h3 className="font-semibold text-sm">AI Assistant</h3>
            <p className="text-xs text-base-content/60 truncate max-w-[200px]">
              Improve {templateName}
            </p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {/* Empty State */}
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center text-base-content/60 py-8">
            <Icon
              icon="lucide--message-square-plus"
              className="size-12 mb-3 opacity-40"
            />
            <p className="text-sm font-medium mb-1">Start a conversation</p>
            <p className="text-xs max-w-[200px]">
              Ask the AI to help improve the email template's design or content.
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
            currentMjml={currentMjml}
            currentSubject={currentSubject}
            currentVersionNumber={currentVersionNumber}
            sampleData={sampleData}
            onApplySuggestion={handleApplySuggestion}
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
              placeholder="Ask about this template..."
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
  message: EmailTemplateRefinementMessage;
  currentMjml: string;
  currentSubject: string;
  currentVersionNumber?: number;
  sampleData?: Record<string, unknown>;
  onApplySuggestion: (
    messageId: string,
    suggestion: EmailTemplateSuggestion
  ) => Promise<ApplyResult>;
}

function MessageItem({
  message,
  currentMjml,
  currentSubject,
  currentVersionNumber,
  sampleData,
  onApplySuggestion,
}: MessageItemProps) {
  const isAssistant = message.role === 'assistant';
  const formattedTime = formatTimestamp(message.createdAt);

  // Strip suggestion markers from content for display
  const displayContent = stripEmailSuggestionMarkers(message.content);

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
              {displayContent}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-sm">{message.content}</div>
        )}

        {/* Suggestions */}
        {message.suggestions && message.suggestions.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.suggestions.map((suggestion) => (
              <EmailSuggestionCard
                key={suggestion.index}
                suggestion={suggestion}
                currentContent={
                  suggestion.type === 'mjml_change'
                    ? currentMjml
                    : currentSubject
                }
                currentVersionNumber={currentVersionNumber}
                sampleData={sampleData}
                onApply={() => onApplySuggestion(message.id, suggestion)}
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

// --- Email Suggestion Card Component ---

interface ApplyResult {
  success: boolean;
  error?: string;
}

interface EmailSuggestionCardProps {
  suggestion: EmailTemplateSuggestion;
  currentContent: string;
  currentVersionNumber?: number;
  sampleData?: Record<string, unknown>;
  onApply: () => Promise<ApplyResult>;
}

type PreviewTab = 'preview' | 'diff';

function EmailSuggestionCard({
  suggestion,
  currentContent,
  currentVersionNumber,
  sampleData,
  onApply,
}: EmailSuggestionCardProps) {
  const { apiBase, fetchJson } = useApi();
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PreviewTab>('preview');
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const isPending = suggestion.status === 'pending';
  const isAccepted = suggestion.status === 'accepted';
  const isRejected = suggestion.status === 'rejected';

  const isOutdated =
    isPending &&
    suggestion.generatedForVersion !== undefined &&
    currentVersionNumber !== undefined &&
    suggestion.generatedForVersion < currentVersionNumber;

  const typeLabel =
    suggestion.type === 'mjml_change' ? 'MJML Change' : 'Subject Change';
  const typeIcon =
    suggestion.type === 'mjml_change' ? 'lucide--code' : 'lucide--type';

  const fetchRenderedPreview = useCallback(async () => {
    if (suggestion.type !== 'mjml_change') return;

    setIsLoadingPreview(true);
    setPreviewError(null);
    try {
      const response = await previewCustomMjml(
        apiBase,
        fetchJson,
        suggestion.newContent,
        undefined,
        sampleData
      );
      setRenderedHtml(response.html);
    } catch (err) {
      setPreviewError(
        err instanceof Error ? err.message : 'Failed to render preview'
      );
    } finally {
      setIsLoadingPreview(false);
    }
  }, [apiBase, fetchJson, suggestion.type, suggestion.newContent, sampleData]);

  useEffect(() => {
    if (isPreviewOpen && suggestion.type === 'mjml_change' && !renderedHtml) {
      fetchRenderedPreview();
    }
  }, [isPreviewOpen, suggestion.type, renderedHtml, fetchRenderedPreview]);

  const handleApply = useCallback(
    async (closeModal = false) => {
      setIsApplying(true);
      setApplyError(null);
      try {
        const result = await onApply();
        if (result.success) {
          if (closeModal) {
            setIsPreviewOpen(false);
          }
        } else if (result.error) {
          setApplyError(result.error);
        }
      } catch (err) {
        setApplyError(
          err instanceof Error ? err.message : 'Failed to apply suggestion'
        );
      } finally {
        setIsApplying(false);
      }
    },
    [onApply]
  );

  // Truncate content preview
  const contentPreview =
    suggestion.newContent.length > 100
      ? `${suggestion.newContent.slice(0, 100)}...`
      : suggestion.newContent;

  return (
    <div
      className={`rounded-lg border p-2 ${
        isAccepted
          ? 'bg-success/10 border-success/30'
          : isRejected
          ? 'bg-error/10 border-error/30 text-base-content/60'
          : 'bg-base-100 border-base-300'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-1">
        <Icon
          icon={typeIcon}
          className={`size-3.5 ${
            isAccepted
              ? 'text-success'
              : isRejected
              ? 'text-error'
              : isOutdated
              ? 'text-warning'
              : 'text-primary'
          }`}
        />
        <span className="text-xs font-medium">{typeLabel}</span>

        {/* Status badges */}
        {isOutdated && (
          <span className="badge badge-warning badge-xs gap-1 ml-auto">
            <Icon icon="lucide--alert-triangle" className="size-2.5" />
            Outdated
          </span>
        )}
        {isAccepted && (
          <span className="badge badge-success badge-xs gap-1 ml-auto">
            <Icon icon="lucide--check" className="size-2.5" />
            Applied
          </span>
        )}
        {isRejected && (
          <span className="badge badge-error badge-xs gap-1 ml-auto">
            <Icon icon="lucide--x" className="size-2.5" />
            Rejected
          </span>
        )}
      </div>

      {/* Explanation */}
      {suggestion.explanation && (
        <p className="text-xs text-base-content/70 mb-1.5">
          {suggestion.explanation}
        </p>
      )}

      {/* Content Preview */}
      <div className="bg-base-200/50 rounded p-1.5 text-xs font-mono overflow-x-auto">
        <pre className="text-[10px] whitespace-pre-wrap break-all">
          {contentPreview}
        </pre>
      </div>

      {/* Actions */}
      {isPending && (
        <div className="flex flex-col gap-2 mt-2">
          {applyError && <div className="text-xs text-error">{applyError}</div>}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-xs gap-1"
              onClick={() => setIsPreviewOpen(true)}
              disabled={isApplying}
              aria-label="Preview suggestion"
            >
              <Icon icon="lucide--eye" className="size-3" />
              Preview
            </button>
            <button
              type="button"
              className="btn btn-success btn-xs gap-1"
              onClick={() => handleApply(false)}
              disabled={isApplying}
              aria-label="Apply suggestion"
            >
              {isApplying ? (
                <span className="loading loading-spinner loading-xs"></span>
              ) : (
                <Icon icon="lucide--check" className="size-3" />
              )}
              {isApplying ? 'Applying...' : 'Apply'}
            </button>
          </div>
        </div>
      )}

      <dialog
        className={`modal ${isPreviewOpen ? 'modal-open' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setIsPreviewOpen(false);
        }}
      >
        <div
          className={`modal-box ${
            suggestion.type === 'mjml_change'
              ? 'max-w-6xl w-[90vw]'
              : 'max-w-3xl'
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Icon icon={typeIcon} className="size-5 text-primary" />
              {typeLabel} Preview
            </h3>
            <button
              type="button"
              className="btn btn-sm btn-circle btn-ghost"
              onClick={() => setIsPreviewOpen(false)}
              aria-label="Close preview"
            >
              <Icon icon="lucide--x" className="size-4" />
            </button>
          </div>

          {suggestion.explanation && (
            <p className="text-sm text-base-content/70 mb-4">
              {suggestion.explanation}
            </p>
          )}

          <div role="tablist" className="tabs tabs-boxed tabs-sm mb-4">
            <button
              type="button"
              role="tab"
              className={`tab gap-1.5 ${
                activeTab === 'preview' ? 'tab-active' : ''
              }`}
              onClick={() => setActiveTab('preview')}
            >
              <Icon icon="lucide--eye" className="size-3.5" />
              Preview
            </button>
            <button
              type="button"
              role="tab"
              className={`tab gap-1.5 ${
                activeTab === 'diff' ? 'tab-active' : ''
              }`}
              onClick={() => setActiveTab('diff')}
            >
              <Icon icon="lucide--git-compare" className="size-3.5" />
              Diff
            </button>
          </div>

          {activeTab === 'preview' ? (
            suggestion.type === 'subject_change' ? (
              <div className="bg-base-200 rounded-lg p-4">
                <div className="text-xs text-base-content/50 mb-1">
                  New Subject Line:
                </div>
                <div className="text-lg font-medium">
                  {suggestion.newContent}
                </div>
              </div>
            ) : isLoadingPreview ? (
              <div className="flex items-center justify-center h-[60vh]">
                <Spinner size="lg" />
              </div>
            ) : previewError ? (
              <div className="alert alert-error">
                <Icon icon="lucide--alert-circle" className="size-5" />
                <span>{previewError}</span>
              </div>
            ) : renderedHtml ? (
              <div className="bg-white rounded-lg overflow-hidden h-[60vh]">
                <iframe
                  srcDoc={renderedHtml}
                  sandbox="allow-same-origin"
                  className="w-full h-full border-0"
                  title="Email Preview"
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-[60vh] text-base-content/50">
                <span>No preview available</span>
              </div>
            )
          ) : suggestion.type === 'subject_change' ? (
            <div className="space-y-3">
              <div className="bg-error/10 border border-error/30 rounded-lg p-3">
                <div className="text-xs text-error/70 mb-1 font-medium">
                  Current Subject:
                </div>
                <div className="text-sm">{currentContent}</div>
              </div>
              <div className="bg-success/10 border border-success/30 rounded-lg p-3">
                <div className="text-xs text-success/70 mb-1 font-medium">
                  Proposed Subject:
                </div>
                <div className="text-sm">{suggestion.newContent}</div>
              </div>
            </div>
          ) : (
            <CodeDiffViewer
              original={currentContent}
              modified={suggestion.newContent}
              language="html"
              viewMode="side-by-side"
              height="60vh"
              originalLabel="Current MJML"
              modifiedLabel="Proposed MJML"
            />
          )}

          <div className="modal-action flex-col sm:flex-row gap-2">
            {applyError && (
              <div className="text-sm text-error mr-auto">{applyError}</div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setIsPreviewOpen(false)}
                disabled={isApplying}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-success gap-1"
                onClick={() => handleApply(true)}
                disabled={isApplying}
              >
                {isApplying ? (
                  <span className="loading loading-spinner loading-sm"></span>
                ) : (
                  <Icon icon="lucide--check" className="size-4" />
                )}
                {isApplying ? 'Applying...' : 'Apply This Change'}
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
}

// --- Utility Functions ---

/**
 * Strip suggestion markers from message content for display.
 * The backend uses [SUGGESTION:type]...[/SUGGESTION] markers.
 */
function stripEmailSuggestionMarkers(content: string): string {
  return content
    .replace(
      /\[SUGGESTION:(mjml_change|subject_change)\][\s\S]*?\[\/SUGGESTION\]/g,
      ''
    )
    .trim();
}

export default EmailTemplateRefinementChat;

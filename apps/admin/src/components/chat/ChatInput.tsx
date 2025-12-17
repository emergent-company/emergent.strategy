import { FormEvent, KeyboardEvent, useRef, useEffect } from 'react';
import { ChatToolsDropdown, type ToolDefinition } from './ChatToolsDropdown';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  disabled?: boolean;
  placeholder?: string;
  onStop?: () => void;
  isStreaming?: boolean;
  messageHistory?: string[];
  onShowKeyboardShortcuts?: () => void;
  /** List of tools available to the chat agent (from API) */
  tools?: ToolDefinition[];
  /** Currently enabled tool names (null = all enabled) */
  enabledTools?: string[] | null;
  /** Called when a tool is toggled */
  onToolToggle?: (toolName: string, enabled: boolean) => void;
}

/**
 * ChatInput - Form-based chat input component with keyboard shortcuts
 *
 * Features:
 * - Multi-line textarea with dynamic height
 * - Keyboard shortcuts (Arrow Up/Down for history, Shift+Enter for newline)
 * - Attachment + send/stop buttons
 * - Disabled state during streaming
 * - Message history navigation
 * - Form-based submission
 * - Auto-focus on mount and when re-enabled (e.g., after streaming ends)
 *
 * Keyboard Shortcuts:
 * - Enter: Send message
 * - Shift+Enter: New line
 * - Arrow Up: Navigate to previous message (when cursor at start and input empty or at position 0)
 * - Arrow Down: Navigate to next message in history
 * - Escape: Clear input
 * - Cmd/Ctrl+/: Show keyboard shortcuts help
 */
export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = 'Type a message...',
  onStop,
  isStreaming = false,
  messageHistory = [],
  onShowKeyboardShortcuts,
  tools = [],
  enabledTools = null,
  onToolToggle,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyIndexRef = useRef<number>(-1);
  const savedDraftRef = useRef<string>('');

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    // Set height to scrollHeight (content height)
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, [value]);

  // Focus input on mount and when re-enabled (e.g., after streaming ends)
  useEffect(() => {
    if (!disabled) {
      textareaRef.current?.focus();
    }
  }, [disabled]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!disabled && value.trim()) {
      historyIndexRef.current = -1; // Reset history navigation
      savedDraftRef.current = ''; // Clear saved draft
      onSubmit(e);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    const cursorPosition = textarea.selectionStart;
    const isAtStart = cursorPosition === 0;
    const isEmpty = value.trim() === '';

    // Cmd/Ctrl + / : Show keyboard shortcuts
    if ((e.metaKey || e.ctrlKey) && e.key === '/') {
      e.preventDefault();
      onShowKeyboardShortcuts?.();
      return;
    }

    // Enter: Send message (unless Shift is held)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) {
        handleSubmit(e as any);
      }
      return;
    }

    // Shift + Enter: Allow newline (default textarea behavior)
    if (e.key === 'Enter' && e.shiftKey) {
      // Let the default behavior happen (insert newline)
      return;
    }

    // Escape: Clear input
    if (e.key === 'Escape') {
      e.preventDefault();
      historyIndexRef.current = -1;
      savedDraftRef.current = '';
      onChange('');
      return;
    }

    // Arrow Up: Navigate to previous message in history
    if (
      e.key === 'ArrowUp' &&
      (isAtStart || isEmpty) &&
      messageHistory.length > 0
    ) {
      e.preventDefault();

      // Save current draft if not already navigating history
      if (historyIndexRef.current === -1) {
        savedDraftRef.current = value;
      }

      // Move to previous message in history
      const newIndex = Math.min(
        historyIndexRef.current + 1,
        messageHistory.length - 1
      );
      historyIndexRef.current = newIndex;

      // Load message from history (history is in reverse order, most recent first)
      onChange(messageHistory[newIndex]);
      return;
    }

    // Arrow Down: Navigate to next message in history (or return to draft)
    if (e.key === 'ArrowDown' && historyIndexRef.current > -1) {
      e.preventDefault();

      const newIndex = historyIndexRef.current - 1;
      historyIndexRef.current = newIndex;

      if (newIndex === -1) {
        // Restore saved draft
        onChange(savedDraftRef.current);
        savedDraftRef.current = '';
      } else {
        // Load next message from history
        onChange(messageHistory[newIndex]);
      }
      return;
    }
  };

  return (
    <div className="p-4 bg-base-100 border-t border-base-300">
      <form className="max-w-4xl mx-auto" onSubmit={handleSubmit}>
        {/* Edit mode indicator */}
        {historyIndexRef.current > -1 && (
          <div className="mb-2 flex items-center gap-2 text-xs text-base-content/60">
            <span className="iconify lucide--history size-3"></span>
            <span>Editing previous message</span>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => {
                historyIndexRef.current = -1;
                onChange(savedDraftRef.current);
                savedDraftRef.current = '';
              }}
            >
              Cancel
            </button>
          </div>
        )}

        <div className="flex items-end gap-2 bg-base-200 rounded-lg p-3 shadow-sm border border-base-300">
          {/* Tools Dropdown - Shows available tools with enable/disable checkboxes */}
          {tools.length > 0 && onToolToggle && (
            <ChatToolsDropdown
              tools={tools}
              enabledTools={enabledTools}
              onToolToggle={onToolToggle}
            />
          )}

          {/* Attachment Button (placeholder for future file upload) */}
          <button
            className="btn btn-ghost btn-sm btn-circle"
            aria-label="Attachment"
            type="button"
            disabled={disabled}
          >
            <span className="iconify lucide--paperclip size-4.5" />
          </button>

          {/* Message Input - Textarea for multi-line support */}
          <textarea
            ref={textareaRef}
            className="flex-1 bg-transparent border-none outline-none focus:outline-none disabled:cursor-not-allowed placeholder:text-base-content/40 resize-none min-h-[28px] max-h-[200px]"
            name="message"
            aria-label="Message"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            rows={1}
          />

          {/* Send/Stop Button */}
          {isStreaming && onStop ? (
            <button
              className="btn btn-error btn-circle btn-sm"
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
            >
              <span className="iconify lucide--square size-4.5" />
            </button>
          ) : (
            <button
              className="btn btn-primary btn-circle btn-sm"
              type="submit"
              aria-label="Send message"
              disabled={disabled || !value.trim()}
            >
              <span className="iconify lucide--send-horizonal size-4.5" />
            </button>
          )}
        </div>

        {/* Keyboard shortcuts hint */}
        <div className="mt-2 flex items-center justify-between text-xs text-base-content/40">
          <span>
            <kbd className="kbd kbd-xs">Enter</kbd> to send,{' '}
            <kbd className="kbd kbd-xs">Shift</kbd>+
            <kbd className="kbd kbd-xs">Enter</kbd> for new line
          </span>
          {onShowKeyboardShortcuts && (
            <button
              type="button"
              className="link link-hover flex items-center gap-1"
              onClick={onShowKeyboardShortcuts}
            >
              <span className="iconify lucide--keyboard size-3"></span>
              <span>Shortcuts</span>
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

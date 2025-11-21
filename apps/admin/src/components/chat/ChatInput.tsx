import { FormEvent } from 'react';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e: FormEvent) => void;
  disabled?: boolean;
  placeholder?: string;
  onStop?: () => void;
  isStreaming?: boolean;
}

/**
 * ChatInput - Form-based chat input component
 *
 * Features:
 * - Clean input field with rounded corners
 * - Subtle border with no focus ring
 * - Attachment + send buttons
 * - Disabled state during streaming
 * - Optional stop button during streaming
 * - Form-based submission (Enter key support)
 */
export function ChatInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = 'Type a message...',
  onStop,
  isStreaming = false,
}: ChatInputProps) {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!disabled && value.trim()) {
      onSubmit(e);
    }
  };

  return (
    <div className="p-4 bg-base-100 border-t border-base-300">
      <form className="max-w-4xl mx-auto" onSubmit={handleSubmit}>
        <div className="flex items-center gap-2 bg-base-200 rounded-lg p-3 shadow-sm border border-base-300">
          {/* Attachment Button (placeholder for future file upload) */}
          <button
            className="btn btn-ghost btn-sm btn-circle"
            aria-label="Attachment"
            type="button"
            disabled={disabled}
          >
            <span className="iconify lucide--paperclip size-4.5" />
          </button>

          {/* Message Input */}
          <input
            className="flex-1 bg-transparent border-none outline-none focus:outline-none disabled:cursor-not-allowed placeholder:text-base-content/40"
            name="message"
            type="text"
            aria-label="Message"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
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
      </form>
    </div>
  );
}

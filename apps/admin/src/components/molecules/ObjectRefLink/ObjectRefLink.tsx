import { Icon } from '@/components/atoms/Icon';

export interface ObjectRefLinkProps {
  /** Display text (usually the object name or key) */
  text: string;
  /** Click handler to open object details */
  onClick: () => void;
  /** Optional: show loading state */
  loading?: boolean;
}

/**
 * Compact inline link for referencing objects.
 * Designed to be used inline with text, similar to a hyperlink.
 *
 * Design:
 * - Small, inline-friendly (similar to a link)
 * - Icon + text (no colors, just neutral styling)
 * - Hover effects for interactivity
 * - Compact enough to use in lists or inline text
 *
 * Use this instead of ObjectRefCard for:
 * - Inline object references
 * - Lists of related objects
 * - Embedded relationships
 *
 * Use ObjectRefCard for:
 * - Featured object references in chat
 * - Detailed preview cards with descriptions
 */
export function ObjectRefLink({ text, onClick, loading }: ObjectRefLinkProps) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-base-200 animate-pulse">
        <Icon icon="lucide--box" className="w-3.5 h-3.5 text-base-content/50" />
        <span className="text-sm text-base-content/50">Loading...</span>
      </span>
    );
  }

  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded hover:bg-base-200 transition-colors group"
      type="button"
    >
      <Icon
        icon="lucide--box"
        className="w-3.5 h-3.5 text-base-content/50 group-hover:text-base-content/70 transition-colors"
      />
      <span className="text-sm text-base-content link hover:link-primary no-underline transition-colors">
        {text}
      </span>
    </button>
  );
}

/**
 * Shared utility functions for chat components
 */
import { format, isToday, isYesterday, differenceInHours } from 'date-fns';

/**
 * Strip suggestion JSON blocks from message content.
 * The LLM sometimes outputs suggestions in ```suggestions ... ``` or ```json ... ``` blocks
 * which should be parsed separately, not displayed as raw JSON.
 *
 * Handles multiple suggestion types:
 * - Object refinement: property_change, rename, relationship_add, relationship_remove
 * - Template studio: add_object_type, modify_object_type, remove_object_type,
 *   add_relationship_type, modify_relationship_type, remove_relationship_type
 * - Merge chat: hidden MERGE_DATA blocks
 */
export function stripSuggestionsFromContent(content: string): string {
  return (
    content
      // Remove hidden MERGE_DATA blocks (merge chat suggestions)
      .replace(/<!--MERGE_DATA[\s\S]*?MERGE_DATA-->/g, '')
      // Remove ```suggestions ... ``` blocks (flexible whitespace to match parser)
      .replace(/```suggestions\s*[\s\S]*?```/g, '')
      // Remove JSON blocks that look like object refinement suggestions
      .replace(
        /```json\s*\n\s*\[\s*\{[\s\S]*?"type"\s*:\s*"(property_change|rename|relationship_add|relationship_remove)"[\s\S]*?\]\s*\n```/g,
        ''
      )
      // Remove JSON blocks that look like template studio suggestions
      .replace(
        /```json\s*\n\s*\[\s*\{[\s\S]*?"type"\s*:\s*"(add_object_type|modify_object_type|remove_object_type|add_relationship_type|modify_relationship_type|remove_relationship_type|update_ui_config|update_extraction_prompt)"[\s\S]*?\]\s*\n```/g,
        ''
      )
      // Remove standalone JSON arrays that look like tool results
      .replace(
        /^\s*\[\s*\{[\s\S]*?"(key|id|name|type)"[\s\S]*?\}\s*\]\s*$/gm,
        ''
      )
      .trim()
  );
}

/**
 * Format a timestamp for display in chat messages.
 * Returns human-readable relative times for recent messages.
 *
 * @param createdAt - ISO timestamp or Date object
 * @returns Formatted string like "just now", "2 hours ago", "3:45 PM", "Dec 15, 3:45 PM"
 */
export function formatTimestamp(createdAt: string | Date): string {
  try {
    const date =
      typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
    const now = new Date();
    const hoursAgo = differenceInHours(now, date);

    if (hoursAgo < 1) {
      return 'just now';
    }
    if (hoursAgo < 5) {
      return hoursAgo === 1 ? '1 hour ago' : `${hoursAgo} hours ago`;
    }
    if (isToday(date) || isYesterday(date)) {
      return format(date, 'h:mm a');
    }
    return format(date, 'MMM d, h:mm a');
  } catch {
    return 'just now';
  }
}

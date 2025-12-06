/**
 * Format Relative Time Utility
 * ============================
 * Provides human-friendly relative time formatting using native Intl.RelativeTimeFormat.
 *
 * Format rules:
 * - < 1 minute: "just now"
 * - < 1 hour: "X minutes ago"
 * - < 24 hours: "X hours ago"
 * - < 48 hours: "yesterday"
 * - < 7 days: "X days ago"
 * - Otherwise: Formatted date (e.g., "Nov 25, 2024")
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Formats a date as a human-friendly relative time string.
 *
 * @param date - Date to format (Date object or ISO string)
 * @param now - Optional current time for testing (defaults to new Date())
 * @returns Human-friendly relative time string
 *
 * @example
 * formatRelativeTime(new Date(Date.now() - 30000)) // "just now"
 * formatRelativeTime(new Date(Date.now() - 5 * 60 * 1000)) // "5 minutes ago"
 * formatRelativeTime(new Date(Date.now() - 3 * 60 * 60 * 1000)) // "3 hours ago"
 * formatRelativeTime(new Date(Date.now() - 36 * 60 * 60 * 1000)) // "yesterday"
 * formatRelativeTime(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)) // "3 days ago"
 */
export function formatRelativeTime(
  date: Date | string,
  now: Date = new Date()
): string {
  const targetDate = typeof date === 'string' ? new Date(date) : date;

  // Handle invalid dates
  if (isNaN(targetDate.getTime())) {
    return 'Invalid date';
  }

  const diffMs = now.getTime() - targetDate.getTime();

  // Future dates - shouldn't happen for "accessed" times, but handle gracefully
  if (diffMs < 0) {
    return 'in the future';
  }

  // Less than 1 minute
  if (diffMs < MINUTE) {
    return 'just now';
  }

  // Less than 1 hour
  if (diffMs < HOUR) {
    const minutes = Math.floor(diffMs / MINUTE);
    return formatRelative(-minutes, 'minute');
  }

  // Less than 24 hours
  if (diffMs < DAY) {
    const hours = Math.floor(diffMs / HOUR);
    return formatRelative(-hours, 'hour');
  }

  // Less than 48 hours (yesterday)
  if (diffMs < 2 * DAY) {
    return 'yesterday';
  }

  // Less than 7 days
  if (diffMs < WEEK) {
    const days = Math.floor(diffMs / DAY);
    return formatRelative(-days, 'day');
  }

  // Older than a week - show formatted date
  return formatAbsoluteDate(targetDate);
}

/**
 * Uses Intl.RelativeTimeFormat for localized relative time strings.
 */
function formatRelative(
  value: number,
  unit: Intl.RelativeTimeFormatUnit
): string {
  const formatter = new Intl.RelativeTimeFormat('en', {
    numeric: 'auto',
    style: 'long',
  });
  return formatter.format(value, unit);
}

/**
 * Formats an absolute date for display when the date is older than a week.
 */
function formatAbsoluteDate(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year:
      date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
  return formatter.format(date);
}

/**
 * Formats a date for display with both relative time and action type.
 * Used in the Recent Items page "Last Accessed" column.
 *
 * @param date - Date to format
 * @param actionType - Type of action (viewed/edited)
 * @returns Object with formatted time and action for rendering
 *
 * @example
 * formatAccessedTime(new Date(), 'viewed')
 * // { time: 'just now', action: 'viewed' }
 */
export function formatAccessedTime(
  date: Date | string,
  actionType: 'viewed' | 'edited'
): { time: string; action: 'viewed' | 'edited' } {
  return {
    time: formatRelativeTime(date),
    action: actionType,
  };
}

/**
 * Format utilities for workspace-cli output
 */

/**
 * Returns a formatted timestamp string for log output.
 * Format: [YYYY-MM-DD HH:MM:SS]
 */
export function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

/**
 * Formats a duration in milliseconds to human-readable uptime.
 * Examples: "5s", "3m 45s", "2h 15m", "1d 12h"
 */
export function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

/**
 * Simple timestamp utility for console logging in bootstrap/early-stage code
 * where the full FileLogger is not yet available.
 *
 * Usage:
 *   import { ts, logTs } from './common/logger/timestamp';
 *   console.log(ts(), '[bootstrap] Starting...');
 *   // Or use the helper:
 *   logTs('[bootstrap] Starting...');
 */

/**
 * Get a formatted timestamp string (HH:MM:SS.mmm)
 */
export function ts(): string {
  const now = new Date();
  const time = now.toTimeString().split(' ')[0];
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `[${time}.${ms}]`;
}

/**
 * Log a message with timestamp prefix
 */
export function logTs(...args: unknown[]): void {
  console.log(ts(), ...args);
}

/**
 * Log an error with timestamp prefix
 */
export function errorTs(...args: unknown[]): void {
  console.error(ts(), ...args);
}

/**
 * Log a warning with timestamp prefix
 */
export function warnTs(...args: unknown[]): void {
  console.warn(ts(), ...args);
}

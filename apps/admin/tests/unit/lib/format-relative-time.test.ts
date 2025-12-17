import { describe, it, expect } from 'vitest';
import {
  formatRelativeTime,
  formatAccessedTime,
} from '../../../src/lib/format-relative-time';

describe('formatRelativeTime', () => {
  // Use a fixed "now" time for consistent testing
  const NOW = new Date('2025-01-15T12:00:00Z');

  describe('just now (< 1 minute)', () => {
    it('should return "just now" for current time', () => {
      expect(formatRelativeTime(NOW, NOW)).toBe('just now');
    });

    it('should return "just now" for 30 seconds ago', () => {
      const thirtySecondsAgo = new Date(NOW.getTime() - 30 * 1000);
      expect(formatRelativeTime(thirtySecondsAgo, NOW)).toBe('just now');
    });

    it('should return "just now" for 59 seconds ago', () => {
      const fiftyNineSecondsAgo = new Date(NOW.getTime() - 59 * 1000);
      expect(formatRelativeTime(fiftyNineSecondsAgo, NOW)).toBe('just now');
    });
  });

  describe('minutes ago (1-59 minutes)', () => {
    it('should return "1 minute ago" for exactly 1 minute ago', () => {
      const oneMinuteAgo = new Date(NOW.getTime() - 60 * 1000);
      expect(formatRelativeTime(oneMinuteAgo, NOW)).toBe('1 minute ago');
    });

    it('should return "5 minutes ago" for 5 minutes ago', () => {
      const fiveMinutesAgo = new Date(NOW.getTime() - 5 * 60 * 1000);
      expect(formatRelativeTime(fiveMinutesAgo, NOW)).toBe('5 minutes ago');
    });

    it('should return "59 minutes ago" for 59 minutes ago', () => {
      const fiftyNineMinutesAgo = new Date(NOW.getTime() - 59 * 60 * 1000);
      expect(formatRelativeTime(fiftyNineMinutesAgo, NOW)).toBe(
        '59 minutes ago'
      );
    });
  });

  describe('hours ago (1-23 hours)', () => {
    it('should return "1 hour ago" for exactly 1 hour ago', () => {
      const oneHourAgo = new Date(NOW.getTime() - 60 * 60 * 1000);
      expect(formatRelativeTime(oneHourAgo, NOW)).toBe('1 hour ago');
    });

    it('should return "3 hours ago" for 3 hours ago', () => {
      const threeHoursAgo = new Date(NOW.getTime() - 3 * 60 * 60 * 1000);
      expect(formatRelativeTime(threeHoursAgo, NOW)).toBe('3 hours ago');
    });

    it('should return "23 hours ago" for 23 hours ago', () => {
      const twentyThreeHoursAgo = new Date(NOW.getTime() - 23 * 60 * 60 * 1000);
      expect(formatRelativeTime(twentyThreeHoursAgo, NOW)).toBe('23 hours ago');
    });
  });

  describe('yesterday (24-47 hours)', () => {
    it('should return "yesterday" for exactly 24 hours ago', () => {
      const twentyFourHoursAgo = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(twentyFourHoursAgo, NOW)).toBe('yesterday');
    });

    it('should return "yesterday" for 36 hours ago', () => {
      const thirtySixHoursAgo = new Date(NOW.getTime() - 36 * 60 * 60 * 1000);
      expect(formatRelativeTime(thirtySixHoursAgo, NOW)).toBe('yesterday');
    });

    it('should return "yesterday" for 47 hours ago', () => {
      const fortySevenHoursAgo = new Date(NOW.getTime() - 47 * 60 * 60 * 1000);
      expect(formatRelativeTime(fortySevenHoursAgo, NOW)).toBe('yesterday');
    });
  });

  describe('days ago (2-6 days)', () => {
    it('should return "2 days ago" for exactly 48 hours ago', () => {
      const twoDaysAgo = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(twoDaysAgo, NOW)).toBe('2 days ago');
    });

    it('should return "5 days ago" for 5 days ago', () => {
      const fiveDaysAgo = new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(fiveDaysAgo, NOW)).toBe('5 days ago');
    });

    it('should return "6 days ago" for 6 days ago', () => {
      const sixDaysAgo = new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000);
      expect(formatRelativeTime(sixDaysAgo, NOW)).toBe('6 days ago');
    });
  });

  describe('older than a week (formatted date)', () => {
    it('should return formatted date for 7 days ago', () => {
      const sevenDaysAgo = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
      const result = formatRelativeTime(sevenDaysAgo, NOW);
      // Should be Jan 8 (same year, no year displayed)
      expect(result).toBe('Jan 8');
    });

    it('should return formatted date for 30 days ago', () => {
      const thirtyDaysAgo = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);
      const result = formatRelativeTime(thirtyDaysAgo, NOW);
      // Dec 16, 2024 is in a different year than the real "now" (2025),
      // so the year is included in the output
      expect(result).toBe('Dec 16, 2024');
    });

    it('should include year for dates in a different year', () => {
      // NOW is Jan 15, 2025. A date from 2024 should include the year.
      const lastYear = new Date('2024-06-15T12:00:00Z');
      const result = formatRelativeTime(lastYear, NOW);
      expect(result).toBe('Jun 15, 2024');
    });
  });

  describe('edge cases', () => {
    it('should handle future dates gracefully', () => {
      const futureDate = new Date(NOW.getTime() + 60 * 60 * 1000);
      expect(formatRelativeTime(futureDate, NOW)).toBe('in the future');
    });

    it('should handle invalid date strings', () => {
      expect(formatRelativeTime('not-a-date', NOW)).toBe('Invalid date');
    });

    it('should accept ISO string dates', () => {
      const isoString = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
      expect(formatRelativeTime(isoString, NOW)).toBe('5 minutes ago');
    });

    it('should work without providing "now" parameter', () => {
      // This test just verifies it doesn't throw when now is not provided
      const recentDate = new Date(Date.now() - 60 * 1000);
      const result = formatRelativeTime(recentDate);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('boundary conditions', () => {
    it('should transition from "just now" to "1 minute ago" at 60 seconds', () => {
      const justUnderMinute = new Date(NOW.getTime() - 59 * 1000);
      const exactlyMinute = new Date(NOW.getTime() - 60 * 1000);

      expect(formatRelativeTime(justUnderMinute, NOW)).toBe('just now');
      expect(formatRelativeTime(exactlyMinute, NOW)).toBe('1 minute ago');
    });

    it('should transition from minutes to hours at 60 minutes', () => {
      const fiftyNineMinutes = new Date(NOW.getTime() - 59 * 60 * 1000);
      const sixtyMinutes = new Date(NOW.getTime() - 60 * 60 * 1000);

      expect(formatRelativeTime(fiftyNineMinutes, NOW)).toBe('59 minutes ago');
      expect(formatRelativeTime(sixtyMinutes, NOW)).toBe('1 hour ago');
    });

    it('should transition from hours to yesterday at 24 hours', () => {
      const twentyThreeHours = new Date(NOW.getTime() - 23 * 60 * 60 * 1000);
      const twentyFourHours = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);

      expect(formatRelativeTime(twentyThreeHours, NOW)).toBe('23 hours ago');
      expect(formatRelativeTime(twentyFourHours, NOW)).toBe('yesterday');
    });

    it('should transition from yesterday to days at 48 hours', () => {
      const fortySevenHours = new Date(
        NOW.getTime() - 47 * 60 * 60 * 1000 - 59 * 60 * 1000
      );
      const fortyEightHours = new Date(NOW.getTime() - 48 * 60 * 60 * 1000);

      expect(formatRelativeTime(fortySevenHours, NOW)).toBe('yesterday');
      expect(formatRelativeTime(fortyEightHours, NOW)).toBe('2 days ago');
    });
  });
});

describe('formatAccessedTime', () => {
  it('should return time and action for viewed', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const result = formatAccessedTime(fiveMinutesAgo, 'viewed');

    expect(result.action).toBe('viewed');
    expect(result.time).toBe('5 minutes ago');
  });

  it('should return time and action for edited', () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const result = formatAccessedTime(oneHourAgo, 'edited');

    expect(result.action).toBe('edited');
    expect(result.time).toBe('1 hour ago');
  });

  it('should accept ISO string dates', () => {
    const isoString = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const result = formatAccessedTime(isoString, 'viewed');

    expect(result.action).toBe('viewed');
    expect(result.time).toBe('5 minutes ago');
  });

  it('should return correct structure with time and action properties', () => {
    const recentDate = new Date(Date.now() - 30 * 1000);
    const result = formatAccessedTime(recentDate, 'viewed');

    expect(result).toHaveProperty('time');
    expect(result).toHaveProperty('action');
    expect(typeof result.time).toBe('string');
    expect(['viewed', 'edited']).toContain(result.action);
  });
});

/**
 * Unit tests for TTL-Based Auto-Expiration Utilities (Phase 3 - Task 7c)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    buildExpirationFilterClause,
    isExpired,
    getTTL,
    createExpirationTimestamp,
} from '../src/modules/graph/utils/expiration-filter.util';

describe('expiration-filter.util', () => {
    describe('buildExpirationFilterClause', () => {
        it('should build expiration filter clause without table alias', () => {
            const clause = buildExpirationFilterClause();

            expect(clause).toBe('(expires_at IS NULL OR expires_at > now())');
        });

        it('should build expiration filter clause with table alias', () => {
            const clause = buildExpirationFilterClause('o');

            expect(clause).toBe('(o.expires_at IS NULL OR o.expires_at > now())');
        });

        it('should handle different table aliases', () => {
            expect(buildExpirationFilterClause('obj')).toBe('(obj.expires_at IS NULL OR obj.expires_at > now())');
            expect(buildExpirationFilterClause('t')).toBe('(t.expires_at IS NULL OR t.expires_at > now())');
            expect(buildExpirationFilterClause('h')).toBe('(h.expires_at IS NULL OR h.expires_at > now())');
        });
    });

    describe('isExpired', () => {
        beforeEach(() => {
            // Mock current time to 2025-10-01T12:00:00Z
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2025-10-01T12:00:00Z'));
        });

        it('should return false for null expires_at', () => {
            expect(isExpired(null)).toBe(false);
        });

        it('should return false for undefined expires_at', () => {
            expect(isExpired(undefined)).toBe(false);
        });

        it('should return true for past expiration time', () => {
            const pastDate = '2025-09-30T12:00:00Z'; // 1 day ago
            expect(isExpired(pastDate)).toBe(true);
        });

        it('should return true for current time (edge case)', () => {
            const now = '2025-10-01T12:00:00Z';
            expect(isExpired(now)).toBe(true);
        });

        it('should return false for future expiration time', () => {
            const futureDate = '2025-10-02T12:00:00Z'; // 1 day from now
            expect(isExpired(futureDate)).toBe(false);
        });

        it('should handle ISO 8601 timestamps', () => {
            expect(isExpired('2025-01-01T00:00:00.000Z')).toBe(true);
            expect(isExpired('2026-01-01T00:00:00.000Z')).toBe(false);
        });
    });

    describe('getTTL', () => {
        beforeEach(() => {
            // Mock current time to 2025-10-01T12:00:00Z
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2025-10-01T12:00:00Z'));
        });

        it('should return null for null expires_at', () => {
            expect(getTTL(null)).toBe(null);
        });

        it('should return null for undefined expires_at', () => {
            expect(getTTL(undefined)).toBe(null);
        });

        it('should return 0 for expired objects', () => {
            const pastDate = '2025-09-30T12:00:00Z'; // 1 day ago
            expect(getTTL(pastDate)).toBe(0);
        });

        it('should return TTL in seconds for future expiration', () => {
            const futureDate = '2025-10-01T13:00:00Z'; // 1 hour from now
            const ttl = getTTL(futureDate);

            expect(ttl).toBe(3600); // 1 hour = 3600 seconds
        });

        it('should return correct TTL for various time periods', () => {
            // 1 day from now
            expect(getTTL('2025-10-02T12:00:00Z')).toBe(86400);

            // 1 minute from now
            expect(getTTL('2025-10-01T12:01:00Z')).toBe(60);

            // 30 days from now
            expect(getTTL('2025-10-31T12:00:00Z')).toBe(2592000);
        });

        it('should return 0 for objects expiring at current time', () => {
            const now = '2025-10-01T12:00:00Z';
            expect(getTTL(now)).toBe(0);
        });
    });

    describe('createExpirationTimestamp', () => {
        beforeEach(() => {
            // Mock current time to 2025-10-01T12:00:00Z
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2025-10-01T12:00:00Z'));
        });

        it('should create expiration timestamp for 1 hour TTL', () => {
            const timestamp = createExpirationTimestamp(3600);

            expect(timestamp).toBe('2025-10-01T13:00:00.000Z');
        });

        it('should create expiration timestamp for 1 day TTL', () => {
            const timestamp = createExpirationTimestamp(86400);

            expect(timestamp).toBe('2025-10-02T12:00:00.000Z');
        });

        it('should create expiration timestamp for 30 days TTL', () => {
            const timestamp = createExpirationTimestamp(2592000);

            expect(timestamp).toBe('2025-10-31T12:00:00.000Z');
        });

        it('should create expiration timestamp for 1 minute TTL', () => {
            const timestamp = createExpirationTimestamp(60);

            expect(timestamp).toBe('2025-10-01T12:01:00.000Z');
        });

        it('should handle zero TTL (immediate expiration)', () => {
            const timestamp = createExpirationTimestamp(0);

            expect(timestamp).toBe('2025-10-01T12:00:00.000Z');
        });

        it('should return ISO 8601 formatted timestamp', () => {
            const timestamp = createExpirationTimestamp(3600);

            // Should be valid ISO 8601
            expect(() => new Date(timestamp)).not.toThrow();
            expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        });
    });

    describe('roundtrip consistency', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2025-10-01T12:00:00Z'));
        });

        it('should maintain consistency between createExpirationTimestamp and getTTL', () => {
            const ttlSeconds = 7200; // 2 hours
            const expiresAt = createExpirationTimestamp(ttlSeconds);
            const retrievedTTL = getTTL(expiresAt);

            // Allow small difference due to rounding
            expect(retrievedTTL).toBe(ttlSeconds);
        });

        it('should maintain consistency between createExpirationTimestamp and isExpired', () => {
            const ttlSeconds = 3600; // 1 hour
            const expiresAt = createExpirationTimestamp(ttlSeconds);

            // Should not be expired immediately after creation
            expect(isExpired(expiresAt)).toBe(false);

            // Fast-forward time by 2 hours
            vi.advanceTimersByTime(7200 * 1000);

            // Should now be expired
            expect(isExpired(expiresAt)).toBe(true);
        });
    });

    describe('edge cases', () => {
        beforeEach(() => {
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2025-10-01T12:00:00Z'));
        });

        it('should handle very large TTL values', () => {
            const tenYearsInSeconds = 315360000; // ~10 years
            const timestamp = createExpirationTimestamp(tenYearsInSeconds);
            const ttl = getTTL(timestamp);

            expect(ttl).toBe(tenYearsInSeconds);
            expect(isExpired(timestamp)).toBe(false);
        });

        it('should handle negative TTL by returning 0', () => {
            const pastDate = '2025-09-01T12:00:00Z'; // 30 days ago
            const ttl = getTTL(pastDate);

            expect(ttl).toBe(0);
        });

        it('should handle millisecond precision', () => {
            // Create timestamp 1.5 seconds in the future
            const expiresAt = '2025-10-01T12:00:01.500Z';
            const ttl = getTTL(expiresAt);

            // Should floor to 1 second
            expect(ttl).toBe(1);
        });
    });
});

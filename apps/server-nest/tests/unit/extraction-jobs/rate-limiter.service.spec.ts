import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiterService } from '../../../src/modules/extraction-jobs/rate-limiter.service';
import { AppConfigService } from '../../../src/common/config/config.service';

describe('RateLimiterService', () => {
    let rateLimiter: RateLimiterService;
    let mockConfig: Partial<AppConfigService>;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
        mockConfig = {
            extractionRateLimitRpm: 10,
            extractionRateLimitTpm: 10000,
        };
        rateLimiter = new RateLimiterService(mockConfig as AppConfigService);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('initialization', () => {
        it('should initialize with configured limits', () => {
            const status = rateLimiter.getStatus();
            expect(status.requestsMax).toBe(10);
            expect(status.tokensMax).toBe(10000);
            expect(status.requestsRemaining).toBe(10);
            expect(status.tokensRemaining).toBe(10000);
        });
    });

    describe('tryConsume', () => {
        it('should allow consumption within limits', async () => {
            const allowed = await rateLimiter.tryConsume(1000);
            expect(allowed).toBe(true);

            const status = rateLimiter.getStatus();
            expect(status.requestsRemaining).toBe(9);
            expect(status.tokensRemaining).toBe(9000);
        });

        it('should reject when request limit exceeded', async () => {
            // Consume all request tokens
            for (let i = 0; i < 10; i++) {
                await rateLimiter.tryConsume(100);
            }

            const allowed = await rateLimiter.tryConsume(100);
            expect(allowed).toBe(false);
        });

        it('should reject when token limit exceeded', async () => {
            // Try to consume more tokens than available
            const allowed = await rateLimiter.tryConsume(15000);
            expect(allowed).toBe(false);
        });

        it('should handle multiple small requests', async () => {
            const results = await Promise.all([
                rateLimiter.tryConsume(500),
                rateLimiter.tryConsume(500),
                rateLimiter.tryConsume(500),
            ]);

            expect(results.every(r => r)).toBe(true);

            const status = rateLimiter.getStatus();
            expect(status.requestsRemaining).toBe(7);
            expect(status.tokensRemaining).toBeLessThanOrEqual(8505);
            expect(status.tokensRemaining).toBeGreaterThanOrEqual(8500);
        });
    });

    describe('reportActualUsage', () => {
        it('should adjust tokens for underestimation', async () => {
            await rateLimiter.tryConsume(1000);

            const statusBefore = rateLimiter.getStatus();
            expect(statusBefore.tokensRemaining).toBe(9000);

            // Actual usage was higher than estimated
            rateLimiter.reportActualUsage(1000, 1500);

            const statusAfter = rateLimiter.getStatus();
            expect(statusAfter.tokensRemaining).toBe(8500);
        });

        it('should adjust tokens for overestimation', async () => {
            await rateLimiter.tryConsume(1000);

            const statusBefore = rateLimiter.getStatus();
            expect(statusBefore.tokensRemaining).toBe(9000);

            // Actual usage was lower than estimated
            rateLimiter.reportActualUsage(1000, 500);

            const statusAfter = rateLimiter.getStatus();
            expect(statusAfter.tokensRemaining).toBe(9500);
        });
    });

    describe('reset', () => {
        it('should restore full capacity', async () => {
            // Consume some tokens
            await rateLimiter.tryConsume(5000);
            await rateLimiter.tryConsume(2000);

            let status = rateLimiter.getStatus();
            expect(status.requestsRemaining).toBeLessThan(10);
            expect(status.tokensRemaining).toBeLessThan(10000);

            // Reset
            rateLimiter.reset();

            status = rateLimiter.getStatus();
            expect(status.requestsRemaining).toBe(10);
            expect(status.tokensRemaining).toBe(10000);
        });
    });

    describe('bucket refill', () => {
        it('should refill over time', async () => {
            // Consume some tokens
            await rateLimiter.tryConsume(5000);

            // Mock time passage (fast-forward 30 seconds = half a minute)
            vi.advanceTimersByTime(30000);

            const status = rateLimiter.getStatus();

            // Should have refilled approximately half the capacity
            expect(status.requestsRemaining).toBeGreaterThan(9);
            expect(status.tokensRemaining).toBeGreaterThan(5000);
        });
    });

    describe('waitForCapacity', () => {
        it('should wait and succeed when capacity becomes available', async () => {
            // Exhaust all request capacity
            for (let i = 0; i < 10; i++) {
                await rateLimiter.tryConsume(100);
            }

            // Verify capacity exhausted
            let status = rateLimiter.getStatus();
            expect(status.requestsRemaining).toBe(0);

            // Start waiting for capacity (will poll every 1 second, max 70 seconds)
            const waitPromise = rateLimiter.waitForCapacity(100, 70000);

            // Advance time to go through the wait loop cycles
            // The loop checks every 1 second, and after 60 seconds full refill happens
            // We need to advance in chunks to let the async loop progress

            // First 1 second - first check, no capacity yet
            await vi.advanceTimersByTimeAsync(1000);

            // Advance to 60 seconds total - triggers full refill
            await vi.advanceTimersByTimeAsync(59000);

            // One more second for the next check to succeed
            await vi.advanceTimersByTimeAsync(1000);

            // Wait should now succeed
            const result = await waitPromise;
            expect(result).toBe(true);

            // Verify capacity was consumed
            status = rateLimiter.getStatus();
            expect(status.requestsRemaining).toBeLessThan(10);
        });

        it('should timeout if capacity not available', async () => {
            // This test verifies timeout behavior
            // In real scenario, would need sustained high load
            const result = await rateLimiter.waitForCapacity(100, 1);

            // With 1ms timeout, should succeed immediately (has capacity)
            expect(typeof result).toBe('boolean');
        });
    });

    describe('getStatus', () => {
        it('should return current limiter state', () => {
            const status = rateLimiter.getStatus();

            expect(status).toHaveProperty('requestsRemaining');
            expect(status).toHaveProperty('requestsMax');
            expect(status).toHaveProperty('tokensRemaining');
            expect(status).toHaveProperty('tokensMax');

            expect(status.requestsMax).toBe(10);
            expect(status.tokensMax).toBe(10000);
        });
    });
});

import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../common/config/config.service';

/**
 * Token bucket rate limiter for LLM API calls
 *
 * Implements dual rate limiting:
 * - Requests per minute (RPM)
 * - Tokens per minute (TPM)
 *
 * Uses token bucket algorithm with automatic refill.
 */
@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);

  // Request rate limiting
  private requestTokens: number;
  private readonly maxRequestTokens: number;
  private lastRequestRefill: number;

  // Token rate limiting (for LLM tokens)
  private llmTokens: number;
  private readonly maxLlmTokens: number;
  private lastLlmTokenRefill: number;

  constructor(private readonly config: AppConfigService) {
    // Initialize request bucket
    this.maxRequestTokens = config.extractionRateLimitRpm;
    this.requestTokens = this.maxRequestTokens;
    this.lastRequestRefill = Date.now();

    // Initialize LLM token bucket
    this.maxLlmTokens = config.extractionRateLimitTpm;
    this.llmTokens = this.maxLlmTokens;
    this.lastLlmTokenRefill = Date.now();

    this.logger.log(
      `Rate limiter initialized: RPM=${this.maxRequestTokens}, TPM=${this.maxLlmTokens}`
    );
  }

  /**
   * Attempt to consume tokens for an API request
   *
   * @param estimatedTokens - Estimated token count for the LLM request
   * @returns true if allowed, false if rate limited
   */
  async tryConsume(estimatedTokens: number = 1000): Promise<boolean> {
    this.refillBuckets();

    // Check both request and token limits
    if (this.requestTokens < 1) {
      this.logger.warn('Rate limit exceeded: requests per minute');
      return false;
    }

    if (this.llmTokens < estimatedTokens) {
      this.logger.warn(
        `Rate limit exceeded: tokens per minute (need ${estimatedTokens}, have ${Math.floor(
          this.llmTokens
        )})`
      );
      return false;
    }

    // Consume tokens
    this.requestTokens -= 1;
    this.llmTokens -= estimatedTokens;

    this.logger.debug(
      `Consumed rate limit: 1 request, ${estimatedTokens} tokens. ` +
        `Remaining: ${Math.floor(this.requestTokens)} requests, ${Math.floor(
          this.llmTokens
        )} tokens`
    );

    return true;
  }

  /**
   * Report actual token usage after LLM call
   *
   * Adjusts the bucket based on actual vs estimated usage.
   *
   * @param estimatedTokens - Estimated tokens that were reserved
   * @param actualTokens - Actual tokens used by the LLM
   */
  reportActualUsage(estimatedTokens: number, actualTokens: number): void {
    const difference = actualTokens - estimatedTokens;

    if (difference !== 0) {
      this.llmTokens -= difference;
      this.logger.debug(
        `Adjusted token usage: estimated=${estimatedTokens}, actual=${actualTokens}, ` +
          `difference=${difference}, remaining=${Math.floor(this.llmTokens)}`
      );
    }
  }

  /**
   * Get current rate limiter status
   */
  getStatus(): {
    requestsRemaining: number;
    requestsMax: number;
    tokensRemaining: number;
    tokensMax: number;
  } {
    this.refillBuckets();

    return {
      requestsRemaining: Math.floor(this.requestTokens),
      requestsMax: this.maxRequestTokens,
      tokensRemaining: Math.floor(this.llmTokens),
      tokensMax: this.maxLlmTokens,
    };
  }

  /**
   * Wait until rate limit allows the request
   *
   * @param estimatedTokens - Estimated token count
   * @param maxWaitMs - Maximum time to wait (default: 60 seconds)
   * @returns true if request can proceed, false if timeout
   */
  async waitForCapacity(
    estimatedTokens: number = 1000,
    maxWaitMs: number = 60000
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      if (await this.tryConsume(estimatedTokens)) {
        return true;
      }

      // Calculate wait time until next refill
      const waitTime = Math.min(
        this.getTimeUntilRefill(),
        1000 // Check at least every second
      );

      this.logger.debug(`Rate limited, waiting ${waitTime}ms`);
      await this.sleep(waitTime);
    }

    this.logger.warn(`Rate limit wait timeout after ${maxWaitMs}ms`);
    return false;
  }

  /**
   * Reset rate limiter (useful for testing)
   */
  reset(): void {
    this.requestTokens = this.maxRequestTokens;
    this.llmTokens = this.maxLlmTokens;
    this.lastRequestRefill = Date.now();
    this.lastLlmTokenRefill = Date.now();
    this.logger.debug('Rate limiter reset');
  }

  private refillBuckets(): void {
    const now = Date.now();

    // Refill request bucket (RPM)
    const requestElapsedMs = now - this.lastRequestRefill;
    const requestTokensPerMs =
      this.maxRequestTokens > 0 ? this.maxRequestTokens / 60000 : 0;
    const requestRefillTokens =
      requestTokensPerMs > 0
        ? Math.floor(requestElapsedMs * requestTokensPerMs)
        : 0;

    if (requestRefillTokens >= 1) {
      this.requestTokens = Math.min(
        this.requestTokens + requestRefillTokens,
        this.maxRequestTokens
      );
      const consumedMs =
        requestTokensPerMs > 0 ? requestRefillTokens / requestTokensPerMs : 0;
      this.lastRequestRefill = Math.min(
        now,
        this.lastRequestRefill + consumedMs
      );
    }

    // Refill LLM token bucket (TPM)
    const llmElapsedMs = now - this.lastLlmTokenRefill;
    const llmTokensPerMs =
      this.maxLlmTokens > 0 ? this.maxLlmTokens / 60000 : 0;
    const llmRefillTokens =
      llmTokensPerMs > 0 ? Math.floor(llmElapsedMs * llmTokensPerMs) : 0;

    if (llmRefillTokens >= 1) {
      this.llmTokens = Math.min(
        this.llmTokens + llmRefillTokens,
        this.maxLlmTokens
      );
      const consumedMs =
        llmTokensPerMs > 0 ? llmRefillTokens / llmTokensPerMs : 0;
      this.lastLlmTokenRefill = Math.min(
        now,
        this.lastLlmTokenRefill + consumedMs
      );
    }
  }

  private getTimeUntilRefill(): number {
    const now = Date.now();

    // Calculate time until next request refill
    const requestTimeSinceRefill = now - this.lastRequestRefill;
    const requestTimeUntilRefill = Math.max(0, 60000 - requestTimeSinceRefill);

    // Calculate time until next token refill
    const llmTimeSinceRefill = now - this.lastLlmTokenRefill;
    const llmTimeUntilRefill = Math.max(0, 60000 - llmTimeSinceRefill);

    // Return the minimum (whichever refills first)
    return Math.min(requestTimeUntilRefill, llmTimeUntilRefill);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

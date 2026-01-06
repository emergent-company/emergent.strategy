export interface HealthCheckOptions {
  readonly url: string;
  readonly timeoutMs?: number;
  readonly retries?: number;
  readonly retryDelayMs?: number;
}

export interface HealthCheckResult {
  readonly healthy: boolean;
  readonly statusCode?: number;
  readonly error?: string;
  readonly latencyMs: number;
}

export async function checkHealth(
  options: HealthCheckOptions
): Promise<HealthCheckResult> {
  const { url, timeoutMs = 5000, retries = 3, retryDelayMs = 1000 } = options;

  let lastError: string | undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'workspace-cli-health-check',
        },
      });

      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;

      // IMPORTANT: Consume the response body to allow the connection to be released
      // Without this, Node.js fetch keeps the connection open which can block
      try {
        await response.text();
      } catch {
        // Ignore errors consuming the body
      }

      if (response.ok) {
        return {
          healthy: true,
          statusCode: response.status,
          latencyMs,
        };
      }

      lastError = `HTTP ${response.status} ${response.statusText}`;

      // Don't retry on client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        return {
          healthy: false,
          statusCode: response.status,
          error: lastError,
          latencyMs,
        };
      }
    } catch (error: unknown) {
      const latencyMs = Date.now() - startTime;

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          lastError = `Timeout after ${timeoutMs}ms`;
        } else {
          // Include cause if available for better debugging
          const cause = (error as Error & { cause?: Error }).cause;
          lastError = cause
            ? `${error.message}: ${cause.message}`
            : error.message;
        }
      } else {
        lastError = 'Unknown error';
      }

      // If this is the last retry, return the error
      if (attempt === retries - 1) {
        return {
          healthy: false,
          error: lastError,
          latencyMs,
        };
      }
    }

    // Wait before retrying
    if (attempt < retries - 1) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  return {
    healthy: false,
    error: lastError,
    latencyMs: 0,
  };
}

export async function waitForHealthy(
  options: HealthCheckOptions & { maxWaitMs?: number; debug?: boolean }
): Promise<HealthCheckResult> {
  const { maxWaitMs = 30000, debug = false, ...checkOptions } = options;
  const startTime = Date.now();

  if (debug) {
    console.log(
      `[health-check] Starting waitForHealthy: url=${checkOptions.url}, maxWaitMs=${maxWaitMs}`
    );
  }

  let attemptCount = 0;
  while (Date.now() - startTime < maxWaitMs) {
    attemptCount++;
    const result = await checkHealth(checkOptions);

    if (debug) {
      const elapsed = Date.now() - startTime;
      console.log(
        `[health-check] Attempt ${attemptCount} (${elapsed}ms elapsed): healthy=${
          result.healthy
        }, error=${result.error ?? 'none'}`
      );
    }

    if (result.healthy) {
      return result;
    }

    // Wait a bit before checking again
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  if (debug) {
    console.log(
      `[health-check] Timeout reached after ${attemptCount} attempts`
    );
  }

  return {
    healthy: false,
    error: `Health check timeout after ${maxWaitMs}ms`,
    latencyMs: maxWaitMs,
  };
}

export interface UnhealthyCheckResult {
  readonly unhealthy: boolean;
  readonly lastError?: string;
  readonly latencyMs: number;
}

/**
 * Wait for a service to become unhealthy (stop responding).
 * Used during restarts to confirm the old process has stopped before checking
 * if the new process is healthy.
 */
export async function waitForUnhealthy(
  options: HealthCheckOptions & { maxWaitMs?: number; debug?: boolean }
): Promise<UnhealthyCheckResult> {
  const { maxWaitMs = 15000, debug = false, ...checkOptions } = options;
  const startTime = Date.now();

  if (debug) {
    console.log(
      `[health-check] Starting waitForUnhealthy: url=${checkOptions.url}, maxWaitMs=${maxWaitMs}`
    );
  }

  let attemptCount = 0;
  let lastError: string | undefined;

  while (Date.now() - startTime < maxWaitMs) {
    attemptCount++;
    const result = await checkHealth({
      ...checkOptions,
      retries: 1, // Don't retry when checking for unhealthy
      timeoutMs: checkOptions.timeoutMs ?? 2000,
    });

    if (debug) {
      const elapsed = Date.now() - startTime;
      console.log(
        `[health-check] waitForUnhealthy attempt ${attemptCount} (${elapsed}ms elapsed): healthy=${
          result.healthy
        }, error=${result.error ?? 'none'}`
      );
    }

    if (!result.healthy) {
      lastError = result.error;
      return {
        unhealthy: true,
        lastError,
        latencyMs: Date.now() - startTime,
      };
    }

    // Wait a bit before checking again
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (debug) {
    console.log(
      `[health-check] waitForUnhealthy timeout after ${attemptCount} attempts - service still healthy`
    );
  }

  return {
    unhealthy: false,
    lastError: 'Service is still healthy after timeout',
    latencyMs: maxWaitMs,
  };
}

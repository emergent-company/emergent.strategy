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
          lastError = error.message;
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
  options: HealthCheckOptions & { maxWaitMs?: number }
): Promise<HealthCheckResult> {
  const { maxWaitMs = 30000, ...checkOptions } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const result = await checkHealth(checkOptions);

    if (result.healthy) {
      return result;
    }

    // Wait a bit before checking again
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return {
    healthy: false,
    error: `Health check timeout after ${maxWaitMs}ms`,
    latencyMs: maxWaitMs,
  };
}

/**
 * Custom error class for API errors that preserves HTTP status code
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseData?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  /**
   * Check if error is an authentication error (401 or 403)
   */
  isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /**
   * Check if error is a server error (5xx)
   */
  isServerError(): boolean {
    return this.status >= 500 && this.status < 600;
  }

  /**
   * Check if error is a client error (4xx)
   */
  isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

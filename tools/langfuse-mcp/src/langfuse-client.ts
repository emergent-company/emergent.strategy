/**
 * Langfuse REST API client for querying traces, sessions, and prompts.
 *
 * Uses Basic Auth with public/secret keys.
 * API Reference: https://api.reference.langfuse.com
 */

export interface LangfuseConfig {
  host: string;
  publicKey: string;
  secretKey: string;
}

export interface ListTracesParams {
  page?: number;
  limit?: number;
  userId?: string;
  name?: string;
  sessionId?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
  orderBy?: string;
  tags?: string[];
  version?: string;
  release?: string;
}

export interface TraceSummary {
  id: string;
  name: string | null;
  timestamp: string;
  userId: string | null;
  sessionId: string | null;
  tags: string[];
  latency: number | null;
  totalCost: number | null;
  public: boolean;
  release: string | null;
  version: string | null;
  htmlPath: string;
}

export interface TracesResponse {
  data: TraceSummary[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface Observation {
  id: string;
  traceId: string;
  type: string;
  name: string | null;
  startTime: string;
  endTime: string | null;
  completionStartTime: string | null;
  model: string | null;
  modelParameters: Record<string, unknown> | null;
  input: unknown;
  output: unknown;
  metadata: unknown;
  level: string;
  statusMessage: string | null;
  parentObservationId: string | null;
  promptId: string | null;
  promptName: string | null;
  promptVersion: number | null;
  usage: {
    input: number | null;
    output: number | null;
    total: number | null;
    inputCost: number | null;
    outputCost: number | null;
    totalCost: number | null;
    unit: string | null;
  } | null;
  latency: number | null;
  timeToFirstToken: number | null;
  calculatedInputCost: number | null;
  calculatedOutputCost: number | null;
  calculatedTotalCost: number | null;
}

export interface Score {
  id: string;
  traceId: string;
  name: string;
  value: number | null;
  stringValue: string | null;
  dataType: string;
  comment: string | null;
  observationId: string | null;
}

export interface TraceDetail {
  id: string;
  name: string | null;
  timestamp: string;
  userId: string | null;
  sessionId: string | null;
  tags: string[];
  input: unknown;
  output: unknown;
  metadata: unknown;
  public: boolean;
  release: string | null;
  version: string | null;
  htmlPath: string;
  latency: number | null;
  totalCost: number | null;
  observations: Observation[];
  scores: Score[];
}

export interface SessionSummary {
  id: string;
  createdAt: string;
  projectId: string;
}

export interface SessionsResponse {
  data: SessionSummary[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

// ============================================================================
// Prompt Types
// ============================================================================

export interface ListPromptsParams {
  page?: number;
  limit?: number;
  name?: string;
  label?: string;
  tag?: string;
}

export interface PromptMeta {
  name: string;
  versions: number[];
  labels: string[];
  tags: string[];
  lastUpdatedAt: string;
}

export interface PromptsResponse {
  data: PromptMeta[];
  meta: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface GetPromptParams {
  version?: number;
  label?: string;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface PromptDetail {
  name: string;
  version: number;
  type: 'text' | 'chat';
  prompt: string | ChatMessage[];
  config: Record<string, unknown>;
  labels: string[];
  tags: string[];
}

export interface CreatePromptParams {
  name: string;
  type: 'text' | 'chat';
  prompt: string | ChatMessage[];
  config?: Record<string, unknown>;
  labels?: string[];
  tags?: string[];
  commitMessage?: string;
}

export class LangfuseClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(config: LangfuseConfig) {
    // Remove trailing slash from host
    this.baseUrl = config.host.replace(/\/$/, '');
    // Basic auth: base64(publicKey:secretKey)
    const credentials = Buffer.from(
      `${config.publicKey}:${config.secretKey}`
    ).toString('base64');
    this.authHeader = `Basic ${credentials}`;
  }

  /**
   * Get configuration from environment variables.
   * Returns null if required variables are missing.
   */
  static fromEnv(): LangfuseClient | null {
    const host = process.env.LANGFUSE_HOST;
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;

    if (!host || !publicKey || !secretKey) {
      return null;
    }

    return new LangfuseClient({ host, publicKey, secretKey });
  }

  /**
   * Check which environment variables are missing.
   */
  static getMissingEnvVars(): string[] {
    const missing: string[] = [];
    if (!process.env.LANGFUSE_HOST) missing.push('LANGFUSE_HOST');
    if (!process.env.LANGFUSE_PUBLIC_KEY) missing.push('LANGFUSE_PUBLIC_KEY');
    if (!process.env.LANGFUSE_SECRET_KEY) missing.push('LANGFUSE_SECRET_KEY');
    return missing;
  }

  private async request<T>(
    path: string,
    params?: Record<string, string | number | string[] | undefined>
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);

    // Add query parameters
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          // For array parameters, add each value separately
          for (const v of value) {
            url.searchParams.append(key, v);
          }
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Langfuse API error (${response.status}): ${
          errorText || response.statusText
        }`
      );
    }

    return response.json() as Promise<T>;
  }

  private async postRequest<T>(path: string, body: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Langfuse API error (${response.status}): ${
          errorText || response.statusText
        }`
      );
    }

    return response.json() as Promise<T>;
  }

  /**
   * List traces with optional filtering.
   */
  async listTraces(params: ListTracesParams = {}): Promise<TracesResponse> {
    return this.request<TracesResponse>('/api/public/traces', {
      page: params.page,
      limit: params.limit,
      userId: params.userId,
      name: params.name,
      sessionId: params.sessionId,
      fromTimestamp: params.fromTimestamp,
      toTimestamp: params.toTimestamp,
      orderBy: params.orderBy,
      tags: params.tags,
      version: params.version,
      release: params.release,
    });
  }

  /**
   * Get a specific trace by ID with full details.
   */
  async getTrace(traceId: string): Promise<TraceDetail> {
    return this.request<TraceDetail>(`/api/public/traces/${traceId}`);
  }

  /**
   * List sessions.
   */
  async listSessions(
    params: { page?: number; limit?: number } = {}
  ): Promise<SessionsResponse> {
    return this.request<SessionsResponse>('/api/public/sessions', {
      page: params.page,
      limit: params.limit,
    });
  }

  // ==========================================================================
  // Prompt Methods
  // ==========================================================================

  /**
   * List prompts with optional filtering.
   */
  async listPrompts(params: ListPromptsParams = {}): Promise<PromptsResponse> {
    return this.request<PromptsResponse>('/api/public/v2/prompts', {
      page: params.page,
      limit: params.limit,
      name: params.name,
      label: params.label,
      tag: params.tag,
    });
  }

  /**
   * Get a specific prompt by name.
   * By default returns the version with the "production" label.
   * Specify version or label to get a specific version.
   */
  async getPrompt(
    name: string,
    params: GetPromptParams = {}
  ): Promise<PromptDetail> {
    const queryParams: Record<string, string | number | undefined> = {};
    if (params.version !== undefined) {
      queryParams.version = params.version;
    }
    if (params.label !== undefined) {
      queryParams.label = params.label;
    }
    return this.request<PromptDetail>(
      `/api/public/v2/prompts/${encodeURIComponent(name)}`,
      queryParams
    );
  }

  /**
   * Create a new prompt or a new version of an existing prompt.
   * If a prompt with the same name exists, creates a new version.
   */
  async createPrompt(params: CreatePromptParams): Promise<PromptDetail> {
    return this.postRequest<PromptDetail>('/api/public/v2/prompts', params);
  }
}

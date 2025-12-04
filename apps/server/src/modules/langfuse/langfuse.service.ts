import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
} from '@nestjs/common';
import { Langfuse } from 'langfuse-node';
import { AppConfigService } from '../../common/config/config.service';

@Injectable()
export class LangfuseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LangfuseService.name);
  private langfuse: Langfuse | null = null;
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService
  ) {}

  onModuleInit() {
    if (this.config.langfuseEnabled) {
      this.initializeLangfuse();
    } else {
      this.logger.log('LangFuse observability is disabled');
    }
  }

  async onModuleDestroy() {
    await this.shutdown();
  }

  private initializeLangfuse() {
    const publicKey = this.config.langfusePublicKey;
    const secretKey = this.config.langfuseSecretKey;
    const baseUrl = this.config.langfuseHost;

    if (!publicKey || !secretKey || !baseUrl) {
      this.logger.warn(
        'LangFuse enabled but missing configuration (public key, secret key, or host). Tracing will not work.'
      );
      return;
    }

    try {
      this.langfuse = new Langfuse({
        publicKey,
        secretKey,
        baseUrl,
        flushAt: this.config.langfuseFlushAt,
        flushInterval: this.config.langfuseFlushInterval,
      });
      this.logger.log(`LangFuse initialized at ${baseUrl}`);
    } catch (error) {
      this.logger.error('Failed to initialize LangFuse', error);
      this.langfuse = null;
    }
  }

  isEnabled(): boolean {
    return this.langfuse !== null;
  }

  /**
   * Create a trace for a background job (e.g. extraction job)
   */
  createJobTrace(jobId: string, metadata?: Record<string, any>): string | null {
    if (!this.langfuse) return null;

    try {
      const trace = this.langfuse.trace({
        id: jobId, // Use job ID as trace ID for easy correlation
        name: metadata?.name || `Job ${jobId}`,
        metadata,
        tags: ['background-job'],
        timestamp: new Date(),
      });
      return trace.id;
    } catch (error) {
      this.logger.error(`Failed to create job trace for ${jobId}`, error);
      return null;
    }
  }

  /**
   * Create a trace/span for an LLM observation
   * In LangFuse v3 SDK, we typically use trace.span() or trace.generation()
   * For this integration, we'll return the trace object or ID to allow adding generations
   */
  createObservation(
    traceId: string,
    name: string,
    input: any,
    metadata?: Record<string, any>
  ) {
    if (!this.langfuse) return null;

    try {
      // In SDK v3, we can create a generation directly linked to a trace ID
      // We don't necessarily need the parent trace object if we have the ID
      const generation = this.langfuse.generation({
        traceId,
        name,
        input,
        metadata,
        startTime: new Date(),
      });
      return generation;
    } catch (error) {
      this.logger.error(
        `Failed to create observation for trace ${traceId}`,
        error
      );
      return null;
    }
  }

  /**
   * update an observation (generation) with output and usage
   */
  updateObservation(
    observation: any,
    output: any,
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    },
    model?: string,
    status: 'success' | 'error' = 'success',
    statusMessage?: string
  ) {
    if (!observation || !this.langfuse) return;

    try {
      observation.update({
        output,
        usage: usage
          ? {
              promptTokens: usage.promptTokens,
              completionTokens: usage.completionTokens,
              totalTokens: usage.totalTokens,
            }
          : undefined,
        model,
        endTime: new Date(),
        level: status === 'error' ? 'ERROR' : undefined,
        statusMessage,
      });
    } catch (error) {
      this.logger.error('Failed to update observation', error);
    }
  }

  /**
   * Finalize a trace (mark as completed)
   * Note: In LangFuse, traces don't explicitly need "closing" but we can update status/output
   */
  finalizeTrace(traceId: string, status: 'success' | 'error', output?: any) {
    if (!this.langfuse) return;

    try {
      // We can update the trace using its ID
      this.langfuse.trace({
        id: traceId,
        output,
        tags: [status],
      });
    } catch (error) {
      this.logger.error(`Failed to finalize trace ${traceId}`, error);
    }
  }

  async shutdown() {
    if (this.langfuse) {
      try {
        await this.langfuse.shutdownAsync();
        this.logger.log('LangFuse SDK shut down successfully');
      } catch (error) {
        this.logger.error('Error shutting down LangFuse SDK', error);
      }
    }
  }

  /**
   * Expose the raw client for advanced usage if needed
   */
  getClient(): Langfuse | null {
    return this.langfuse;
  }
}

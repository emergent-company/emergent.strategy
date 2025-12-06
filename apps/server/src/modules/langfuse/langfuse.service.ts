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
    if (!this.langfuse) {
      this.logger.debug(
        `[createObservation] Langfuse not initialized, skipping observation for ${name}`
      );
      return null;
    }

    try {
      this.logger.log(
        `[createObservation] Creating observation "${name}" for trace ${traceId}`
      );
      // In SDK v3, we can create a generation directly linked to a trace ID
      // We don't necessarily need the parent trace object if we have the ID
      const generation = this.langfuse.generation({
        traceId,
        name,
        input,
        metadata,
        startTime: new Date(),
      });
      this.logger.log(
        `[createObservation] Created observation with id: ${generation.id}`
      );
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
    if (!observation || !this.langfuse) {
      this.logger.debug(
        `[updateObservation] No observation or Langfuse not initialized, skipping update`
      );
      return;
    }

    try {
      this.logger.log(
        `[updateObservation] Updating observation ${observation.id} with status: ${status}`
      );
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
      this.logger.log(
        `[updateObservation] Successfully updated observation ${observation.id}`
      );
    } catch (error) {
      this.logger.error('Failed to update observation', error);
    }
  }

  /**
   * Finalize a trace (mark as completed)
   * Note: In LangFuse, traces don't explicitly need "closing" but we can update status/output
   */
  async finalizeTrace(
    traceId: string,
    status: 'success' | 'error',
    output?: any
  ) {
    if (!this.langfuse) return;

    try {
      this.logger.log(
        `[finalizeTrace] Finalizing trace ${traceId} with status: ${status}`
      );
      // We can update the trace using its ID
      this.langfuse.trace({
        id: traceId,
        output,
        tags: [status],
      });
      // Flush to ensure all observations are sent
      await this.flush();
    } catch (error) {
      this.logger.error(`Failed to finalize trace ${traceId}`, error);
    }
  }

  /**
   * Flush pending events to Langfuse
   */
  async flush(): Promise<void> {
    if (!this.langfuse) return;

    try {
      this.logger.debug('[flush] Flushing pending Langfuse events...');
      await this.langfuse.flushAsync();
      this.logger.debug('[flush] Successfully flushed Langfuse events');
    } catch (error) {
      this.logger.error('Failed to flush Langfuse events', error);
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

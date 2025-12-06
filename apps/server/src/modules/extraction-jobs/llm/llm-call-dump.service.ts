import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../../common/config/config.service';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Represents an LLM call for dumping to files
 */
export interface LlmCallDumpData {
  /** Unique identifier for this call */
  callId: string;
  /** Extraction job ID this call belongs to */
  jobId: string;
  /** Call index within the job (1-based) */
  callIndex: number;
  /** Timestamp when the call was made */
  timestamp: string;
  /** Model used for the call */
  model: string;
  /** Extraction mode (tool-binding or json) */
  mode: 'tool-binding' | 'json';

  // Chunk information
  chunkIndex: number;
  totalChunks: number;
  chunkLength: number;

  // Context provided to the LLM
  context: {
    /** Entity types being extracted */
    entityTypes: string[];
    /** Relationship types being extracted */
    relationshipTypes?: string[];
    /** Number of existing entities provided as context */
    existingEntitiesCount: number;
    /** Names of existing entities (for reference) */
    existingEntitySamples?: string[];
    /** Number of previously extracted entities from prior chunks */
    previouslyExtractedCount: number;
    /** Names of previously extracted entities (for reference) */
    previouslyExtractedSamples?: string[];
  };

  // The actual prompt and response
  prompt: {
    /** Full prompt text sent to LLM */
    full: string;
    /** Character count */
    length: number;
  };

  response: {
    /** Raw response content */
    content: string | null;
    /** Parsed tool calls if any */
    toolCalls?: Array<{
      name: string;
      args: any;
    }>;
    /** Duration in milliseconds */
    durationMs: number;
    /** Error message if failed */
    error?: string;
    /** Raw LLM output captured via callback handler (provider-specific data) */
    capturedLlmOutput?: Record<string, any>;
    /** Summary of captured LLM result */
    capturedLlmResultSummary?: {
      generationsCount: number;
      llmOutputKeys: string[];
    };
  };

  // Extraction results
  results: {
    /** Number of entities extracted from this call */
    entitiesExtracted: number;
    /** Number of relationships extracted from this call */
    relationshipsExtracted: number;
    /** Names of extracted entities */
    entityNames?: string[];
    /** Relationship summaries */
    relationshipSummaries?: string[];
  };
}

/**
 * LlmCallDumpService
 *
 * Dumps every LLM call from extraction jobs to files for debugging and analysis.
 * Creates both JSON files (machine-readable) and TXT files (human-readable) for each call.
 *
 * Directory structure:
 *   logs/llm-dumps/
 *     {jobId}/
 *       index.json           - Summary of all calls in this job
 *       call-001.json        - Full JSON data for call 1
 *       call-001-prompt.txt  - Human-readable prompt for call 1
 *       call-001-response.txt - Human-readable response for call 1
 *       call-002.json
 *       ...
 */
@Injectable()
export class LlmCallDumpService {
  private readonly logger = new Logger(LlmCallDumpService.name);
  // Track call index per job
  private jobCallCounters = new Map<string, number>();
  // Track if we've initialized the directory for this enabled state
  private dirInitialized = false;

  constructor(private readonly config: AppConfigService) {
    // Log initial state but don't cache - we'll check dynamically
    const enabled = this.isEnabled();
    if (enabled) {
      this.logger.log(
        `[LLM_DUMP] LLM call dumping ENABLED - output directory: ${this.getBaseDir()}`
      );
      this.initDirectory();
    } else {
      this.logger.debug(
        'LLM call dumping disabled at startup. Set LLM_DUMP_ENABLED=true to enable.'
      );
    }
  }

  /**
   * Check if dumping is enabled (reads config dynamically each time)
   */
  isEnabled(): boolean {
    return !!this.config.llmDumpEnabled;
  }

  /**
   * Get the base directory for dumps (reads config dynamically)
   */
  private getBaseDir(): string {
    return path.resolve(process.cwd(), this.config.llmDumpDir);
  }

  /**
   * Initialize the base directory
   */
  private async initDirectory(): Promise<void> {
    if (this.dirInitialized) return;
    try {
      await fs.mkdir(this.getBaseDir(), { recursive: true });
      this.dirInitialized = true;
    } catch (error) {
      this.logger.error(`Failed to create LLM dump directory: ${error}`);
    }
  }

  /**
   * Start tracking a new extraction job.
   * Creates the job directory and initializes the index.
   */
  async startJob(jobId: string, metadata?: Record<string, any>): Promise<void> {
    if (!this.isEnabled()) return;

    // Ensure directory is initialized
    await this.initDirectory();

    const jobDir = path.join(this.getBaseDir(), jobId);
    await fs.mkdir(jobDir, { recursive: true });

    // Reset call counter for this job
    this.jobCallCounters.set(jobId, 0);

    // Create initial index
    const indexData = {
      jobId,
      startedAt: new Date().toISOString(),
      metadata,
      calls: [] as string[],
    };

    await fs.writeFile(
      path.join(jobDir, 'index.json'),
      JSON.stringify(indexData, null, 2)
    );

    this.logger.log(`[LLM_DUMP] Started tracking job: ${jobId}`);
  }

  /**
   * Dump an LLM call to files.
   * Call this after each LLM invocation.
   */
  async dumpCall(
    data: Omit<LlmCallDumpData, 'callId' | 'callIndex'>
  ): Promise<void> {
    if (!this.isEnabled()) return;

    const { jobId } = data;
    const jobDir = path.join(this.getBaseDir(), jobId);

    // Get and increment call counter
    let callIndex = this.jobCallCounters.get(jobId) || 0;
    callIndex++;
    this.jobCallCounters.set(jobId, callIndex);

    const callId = `call-${String(callIndex).padStart(3, '0')}`;
    const fullData: LlmCallDumpData = {
      ...data,
      callId,
      callIndex,
    };

    try {
      // Ensure job directory exists
      await fs.mkdir(jobDir, { recursive: true });

      // Write JSON file (full data)
      await fs.writeFile(
        path.join(jobDir, `${callId}.json`),
        JSON.stringify(fullData, null, 2)
      );

      // Write human-readable prompt file
      await fs.writeFile(
        path.join(jobDir, `${callId}-prompt.txt`),
        this.formatPromptForHuman(fullData)
      );

      // Write human-readable response file
      await fs.writeFile(
        path.join(jobDir, `${callId}-response.txt`),
        this.formatResponseForHuman(fullData)
      );

      // Update index
      await this.updateIndex(jobId, callId);

      this.logger.debug(
        `[LLM_DUMP] Dumped ${callId} for job ${jobId} ` +
          `(${fullData.results.entitiesExtracted} entities, ${fullData.results.relationshipsExtracted} relationships)`
      );
    } catch (error) {
      this.logger.error(`[LLM_DUMP] Failed to dump call ${callId}: ${error}`);
    }
  }

  /**
   * Mark a job as complete and write final summary.
   */
  async finishJob(
    jobId: string,
    summary?: {
      totalEntities: number;
      totalRelationships: number;
      durationMs: number;
      error?: string;
    }
  ): Promise<void> {
    if (!this.isEnabled()) return;

    const jobDir = path.join(this.getBaseDir(), jobId);
    const indexPath = path.join(jobDir, 'index.json');

    try {
      const indexContent = await fs.readFile(indexPath, 'utf-8');
      const indexData = JSON.parse(indexContent);

      indexData.completedAt = new Date().toISOString();
      indexData.summary = summary;
      indexData.totalCalls = this.jobCallCounters.get(jobId) || 0;

      await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2));

      // Clean up counter
      this.jobCallCounters.delete(jobId);

      this.logger.log(
        `[LLM_DUMP] Finished job ${jobId} - ${indexData.totalCalls} calls dumped`
      );
    } catch (error) {
      this.logger.error(`[LLM_DUMP] Failed to finish job ${jobId}: ${error}`);
    }
  }

  /**
   * Update the job index with a new call.
   */
  private async updateIndex(jobId: string, callId: string): Promise<void> {
    const indexPath = path.join(this.getBaseDir(), jobId, 'index.json');

    try {
      const indexContent = await fs.readFile(indexPath, 'utf-8');
      const indexData = JSON.parse(indexContent);
      indexData.calls.push(callId);
      await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2));
    } catch (error) {
      // Index might not exist yet, create it
      const indexData = {
        jobId,
        startedAt: new Date().toISOString(),
        calls: [callId],
      };
      await fs.writeFile(indexPath, JSON.stringify(indexData, null, 2));
    }
  }

  /**
   * Format the prompt data for human readability.
   */
  private formatPromptForHuman(data: LlmCallDumpData): string {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push(`LLM CALL: ${data.callId}`);
    lines.push('='.repeat(80));
    lines.push('');

    // Metadata
    lines.push('## METADATA');
    lines.push(`Job ID:     ${data.jobId}`);
    lines.push(`Timestamp:  ${data.timestamp}`);
    lines.push(`Model:      ${data.model}`);
    lines.push(`Mode:       ${data.mode}`);
    lines.push(`Chunk:      ${data.chunkIndex + 1} of ${data.totalChunks}`);
    lines.push(`Chunk Size: ${data.chunkLength} characters`);
    lines.push('');

    // Context
    lines.push('## CONTEXT PROVIDED TO LLM');
    lines.push(`Entity Types:      ${data.context.entityTypes.join(', ')}`);
    if (data.context.relationshipTypes?.length) {
      lines.push(
        `Relationship Types: ${data.context.relationshipTypes.join(', ')}`
      );
    }
    lines.push(
      `Relevant Objects (from vector search): ${data.context.existingEntitiesCount}`
    );
    if (
      data.context.existingEntitySamples &&
      data.context.existingEntitySamples.length > 0
    ) {
      lines.push('  Samples:');
      for (const name of data.context.existingEntitySamples.slice(0, 10)) {
        lines.push(`    - ${name}`);
      }
      if (data.context.existingEntitySamples.length > 10) {
        lines.push(
          `    ... and ${data.context.existingEntitySamples.length - 10} more`
        );
      }
    }
    lines.push(
      `Previously Extracted: ${data.context.previouslyExtractedCount}`
    );
    if (
      data.context.previouslyExtractedSamples &&
      data.context.previouslyExtractedSamples.length > 0
    ) {
      lines.push('  Samples:');
      for (const name of data.context.previouslyExtractedSamples.slice(0, 10)) {
        lines.push(`    - ${name}`);
      }
      if (data.context.previouslyExtractedSamples.length > 10) {
        lines.push(
          `    ... and ${
            data.context.previouslyExtractedSamples.length - 10
          } more`
        );
      }
    }
    lines.push('');

    // Prompt
    lines.push('## FULL PROMPT');
    lines.push(`(${data.prompt.length} characters)`);
    lines.push('-'.repeat(80));
    lines.push(data.prompt.full);
    lines.push('-'.repeat(80));

    return lines.join('\n');
  }

  /**
   * Format the response data for human readability.
   */
  private formatResponseForHuman(data: LlmCallDumpData): string {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push(`LLM RESPONSE: ${data.callId}`);
    lines.push('='.repeat(80));
    lines.push('');

    // Response metadata
    lines.push('## RESPONSE INFO');
    lines.push(`Duration: ${data.response.durationMs}ms`);
    if (data.response.error) {
      lines.push(`ERROR: ${data.response.error}`);
    }
    lines.push('');

    // Captured LLM output (from callback handler) - especially useful for debugging errors
    if (data.response.capturedLlmOutput) {
      lines.push('## CAPTURED LLM OUTPUT (via callback handler)');
      lines.push('-'.repeat(80));
      lines.push(JSON.stringify(data.response.capturedLlmOutput, null, 2));
      lines.push('-'.repeat(80));
      lines.push('');
    }

    // Captured LLM result summary
    if (data.response.capturedLlmResultSummary) {
      lines.push('## CAPTURED LLM RESULT SUMMARY');
      lines.push(
        `Generations count: ${data.response.capturedLlmResultSummary.generationsCount}`
      );
      lines.push(
        `LLM output keys: ${
          data.response.capturedLlmResultSummary.llmOutputKeys.join(', ') ||
          '(none)'
        }`
      );
      lines.push('');
    }

    // Tool calls
    if (data.response.toolCalls && data.response.toolCalls.length > 0) {
      lines.push('## TOOL CALLS');
      lines.push(`Total: ${data.response.toolCalls.length}`);
      lines.push('');

      for (let i = 0; i < data.response.toolCalls.length; i++) {
        const tc = data.response.toolCalls[i];
        lines.push(`### Tool Call ${i + 1}: ${tc.name}`);
        lines.push(JSON.stringify(tc.args, null, 2));
        lines.push('');
      }
    }

    // Raw content if present
    if (data.response.content) {
      lines.push('## RAW CONTENT');
      lines.push('-'.repeat(80));
      lines.push(data.response.content);
      lines.push('-'.repeat(80));
      lines.push('');
    }

    // Extraction results
    lines.push('## EXTRACTION RESULTS');
    lines.push(`Entities:      ${data.results.entitiesExtracted}`);
    lines.push(`Relationships: ${data.results.relationshipsExtracted}`);

    if (data.results.entityNames && data.results.entityNames.length > 0) {
      lines.push('');
      lines.push('Extracted Entities:');
      for (const name of data.results.entityNames) {
        lines.push(`  - ${name}`);
      }
    }

    if (
      data.results.relationshipSummaries &&
      data.results.relationshipSummaries.length > 0
    ) {
      lines.push('');
      lines.push('Extracted Relationships:');
      for (const summary of data.results.relationshipSummaries) {
        lines.push(`  - ${summary}`);
      }
    }

    return lines.join('\n');
  }
}

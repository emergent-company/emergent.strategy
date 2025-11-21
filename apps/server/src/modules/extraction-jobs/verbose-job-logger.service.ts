import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * VerboseJobLoggerService
 *
 * Creates individual, extremely verbose log files for each extraction job.
 * Captures every function call, chunk processing, and operation with full context.
 *
 * Log Structure:
 * - One log file per job: logs/extraction-jobs/{jobId}.log
 * - Structured entries with timestamps, function names, parameters, and results
 * - Hierarchical indentation for nested operations
 * - Performance metrics for every operation
 */
@Injectable()
export class VerboseJobLoggerService {
  private readonly logger = new Logger(VerboseJobLoggerService.name);
  private readonly logDir = path.join(
    process.cwd(),
    'apps/logs/extraction-jobs'
  );

  // In-memory buffer for current job logs (flushed periodically)
  private logBuffers = new Map<string, string[]>();
  private flushTimers = new Map<string, NodeJS.Timeout>();

  // Context stack for hierarchical logging
  private contextStack = new Map<string, string[]>();

  // Performance tracking
  private operationStartTimes = new Map<string, number>();

  constructor() {
    this.initFileLogging();
  }

  private async initFileLogging() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
      this.logger.log(`Verbose job logging initialized: ${this.logDir}`);
    } catch (error) {
      this.logger.error('Failed to create extraction job log directory', error);
    }
  }

  /**
   * Initialize logging for a new extraction job
   */
  async startJobLogging(
    jobId: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const logFile = this.getLogFilePath(jobId);

    const header = [
      '='.repeat(100),
      `EXTRACTION JOB LOG - ${jobId}`,
      `Started: ${new Date().toISOString()}`,
      `Metadata: ${JSON.stringify(metadata, null, 2)}`,
      '='.repeat(100),
      '',
    ].join('\n');

    try {
      await fs.writeFile(logFile, header);
      this.logBuffers.set(jobId, []);
      this.contextStack.set(jobId, []);
      this.logger.log(`Started verbose logging for job ${jobId}`);
    } catch (error) {
      this.logger.error(
        `Failed to initialize log file for job ${jobId}`,
        error
      );
    }
  }

  /**
   * Log entry into a function/operation
   */
  logFunctionEntry(
    jobId: string,
    functionName: string,
    params?: Record<string, any>,
    context?: string
  ): void {
    const stack = this.contextStack.get(jobId) || [];
    const indent = '  '.repeat(stack.length);
    const timestamp = new Date().toISOString();

    const lines = [`${indent}┌─ [${timestamp}] ENTER: ${functionName}`];

    if (context) {
      lines.push(`${indent}│  Context: ${context}`);
    }

    if (params && Object.keys(params).length > 0) {
      lines.push(`${indent}│  Parameters:`);
      for (const [key, value] of Object.entries(params)) {
        const valueStr = this.formatValue(value);
        lines.push(`${indent}│    ${key}: ${valueStr}`);
      }
    }

    stack.push(functionName);
    this.contextStack.set(jobId, stack);

    // Track operation start time
    const operationKey = `${jobId}:${functionName}:${stack.length}`;
    this.operationStartTimes.set(operationKey, Date.now());

    this.appendToLog(jobId, lines.join('\n'));
  }

  /**
   * Log exit from a function/operation
   */
  logFunctionExit(
    jobId: string,
    functionName: string,
    result?: any,
    error?: Error
  ): void {
    const stack = this.contextStack.get(jobId) || [];
    const indent = '  '.repeat(Math.max(0, stack.length - 1));
    const timestamp = new Date().toISOString();

    // Calculate duration
    const operationKey = `${jobId}:${functionName}:${stack.length}`;
    const startTime = this.operationStartTimes.get(operationKey);
    const duration = startTime ? Date.now() - startTime : 0;
    this.operationStartTimes.delete(operationKey);

    const lines: string[] = [];

    if (error) {
      lines.push(`${indent}│  ❌ ERROR: ${error.message}`);
      if (error.stack) {
        const stackLines = error.stack.split('\n').slice(1, 4);
        stackLines.forEach((line) => {
          lines.push(`${indent}│     ${line.trim()}`);
        });
      }
    } else if (result !== undefined) {
      lines.push(`${indent}│  Result: ${this.formatValue(result)}`);
    }

    lines.push(
      `${indent}└─ [${timestamp}] EXIT: ${functionName} (${duration}ms)`
    );
    lines.push('');

    stack.pop();
    this.contextStack.set(jobId, stack);

    this.appendToLog(jobId, lines.join('\n'));
  }

  /**
   * Log a detailed operation with sub-steps
   */
  logOperation(
    jobId: string,
    operationName: string,
    details: Record<string, any>
  ): void {
    const stack = this.contextStack.get(jobId) || [];
    const indent = '  '.repeat(stack.length);
    const timestamp = new Date().toISOString();

    const lines = [`${indent}● [${timestamp}] ${operationName}`];

    for (const [key, value] of Object.entries(details)) {
      lines.push(`${indent}  ${key}: ${this.formatValue(value)}`);
    }

    this.appendToLog(jobId, lines.join('\n'));
  }

  /**
   * Log chunk processing with detailed metrics
   */
  logChunkProcessing(
    jobId: string,
    chunkIndex: number,
    totalChunks: number,
    chunkData: {
      content?: string;
      contentLength?: number;
      sentenceCount?: number;
      similarity?: number;
      embedding?: number[];
      entities?: any[];
      processingTimeMs?: number;
      tokensUsed?: number;
      metadata?: Record<string, any>;
    }
  ): void {
    const stack = this.contextStack.get(jobId) || [];
    const indent = '  '.repeat(stack.length);
    const timestamp = new Date().toISOString();

    const lines = [
      '',
      `${indent}${'='.repeat(80)}`,
      `${indent}CHUNK ${chunkIndex + 1}/${totalChunks} - [${timestamp}]`,
      `${indent}${'='.repeat(80)}`,
    ];

    if (chunkData.contentLength !== undefined) {
      lines.push(
        `${indent}  Content Length: ${chunkData.contentLength} characters`
      );
    }

    if (chunkData.sentenceCount !== undefined) {
      lines.push(`${indent}  Sentence Count: ${chunkData.sentenceCount}`);
    }

    if (chunkData.similarity !== undefined) {
      lines.push(
        `${indent}  Semantic Similarity: ${chunkData.similarity.toFixed(4)}`
      );
    }

    if (chunkData.embedding) {
      const embeddingPreview = chunkData.embedding
        .slice(0, 5)
        .map((v) => v.toFixed(4))
        .join(', ');
      lines.push(`${indent}  Embedding Preview: [${embeddingPreview}, ...]`);
      lines.push(
        `${indent}  Embedding Dimensions: ${chunkData.embedding.length}`
      );
    }

    if (chunkData.content) {
      const preview = chunkData.content.substring(0, 200);
      lines.push(`${indent}  Content Preview:`);
      lines.push(
        `${indent}    "${preview}${
          chunkData.content.length > 200 ? '...' : ''
        }"`
      );
    }

    if (chunkData.entities && chunkData.entities.length > 0) {
      lines.push(`${indent}  Extracted Entities: ${chunkData.entities.length}`);
      chunkData.entities.forEach((entity, idx) => {
        lines.push(
          `${indent}    ${idx + 1}. ${entity.type_name}: ${entity.name}`
        );
      });
    }

    if (chunkData.processingTimeMs !== undefined) {
      lines.push(`${indent}  Processing Time: ${chunkData.processingTimeMs}ms`);
    }

    if (chunkData.tokensUsed !== undefined) {
      lines.push(`${indent}  Tokens Used: ${chunkData.tokensUsed}`);
    }

    if (chunkData.metadata) {
      lines.push(`${indent}  Metadata: ${JSON.stringify(chunkData.metadata)}`);
    }

    lines.push(`${indent}${'='.repeat(80)}`);
    lines.push('');

    this.appendToLog(jobId, lines.join('\n'));
  }

  /**
   * Log semantic chunking details
   */
  logSemanticChunking(
    jobId: string,
    details: {
      totalCharacters: number;
      totalSentences: number;
      chunksCreated: number;
      threshold: number;
      // Legacy format (deprecated - causes memory leaks)
      sentences?: Array<{
        index: number;
        text: string;
        similarity?: number;
        chunkId: number;
      }>;
      // New memory-efficient format - just boundaries
      chunkBoundaries?: Array<{
        sentenceIndex: number;
        similarity?: number;
        isChunkBoundary: boolean;
        chunkId: number;
      }>;
    }
  ): void {
    const stack = this.contextStack.get(jobId) || [];
    const indent = '  '.repeat(stack.length);
    const timestamp = new Date().toISOString();

    const lines = [
      '',
      `${indent}┌─ [${timestamp}] SEMANTIC CHUNKING ANALYSIS`,
      `${indent}│  Total Characters: ${details.totalCharacters}`,
      `${indent}│  Total Sentences: ${details.totalSentences}`,
      `${indent}│  Chunks Created: ${details.chunksCreated}`,
      `${indent}│  Similarity Threshold: ${details.threshold}`,
    ];

    // Use new chunk boundaries format (memory efficient)
    if (details.chunkBoundaries && details.chunkBoundaries.length > 0) {
      lines.push(`${indent}│`);
      lines.push(`${indent}│  Chunk Boundary Analysis:`);

      // Show only chunk boundaries (not every sentence)
      const boundaries = details.chunkBoundaries.filter(
        (b) => b.isChunkBoundary
      );
      boundaries.forEach((boundary) => {
        const simStr =
          boundary.similarity !== undefined
            ? ` [similarity drop to ${boundary.similarity.toFixed(4)}]`
            : ' [start]';
        lines.push(
          `${indent}│    Chunk ${boundary.chunkId} starts at sentence ${boundary.sentenceIndex}${simStr}`
        );
      });

      lines.push(`${indent}│`);
      lines.push(
        `${indent}│  Average sentences per chunk: ${(
          details.totalSentences / details.chunksCreated
        ).toFixed(1)}`
      );
    }
    // Legacy format support (deprecated)
    else if (details.sentences && details.sentences.length > 0) {
      lines.push(`${indent}│`);
      lines.push(`${indent}│  Sentence Analysis (legacy - showing first 20):`);

      // Limit to first 20 to prevent excessive log size
      details.sentences.slice(0, 20).forEach((sentence) => {
        const simStr =
          sentence.similarity !== undefined
            ? ` [sim: ${sentence.similarity.toFixed(4)}]`
            : '';
        const preview = sentence.text.substring(0, 60);
        lines.push(
          `${indent}│    ${sentence.index}. Chunk ${sentence.chunkId}${simStr} "${preview}..."`
        );
      });

      if (details.sentences.length > 20) {
        lines.push(
          `${indent}│    ... (${
            details.sentences.length - 20
          } more sentences omitted)`
        );
      }
    }

    lines.push(`${indent}└─ END SEMANTIC CHUNKING`);
    lines.push('');

    this.appendToLog(jobId, lines.join('\n'));
  }

  /**
   * Log LLM invocation details
   */
  logLLMInvocation(
    jobId: string,
    details: {
      provider: string;
      model: string;
      prompt: string;
      promptLength: number;
      temperature?: number;
      maxTokens?: number;
      response?: string;
      responseLength?: number;
      tokensUsed?: number;
      durationMs?: number;
      error?: string;
    }
  ): void {
    const stack = this.contextStack.get(jobId) || [];
    const indent = '  '.repeat(stack.length);
    const timestamp = new Date().toISOString();

    const lines = [
      '',
      `${indent}╔${'═'.repeat(78)}╗`,
      `${indent}║ LLM INVOCATION - [${timestamp}]${' '.repeat(
        78 - timestamp.length - 19
      )}║`,
      `${indent}╠${'═'.repeat(78)}╣`,
      `${indent}║ Provider: ${details.provider}${' '.repeat(
        78 - details.provider.length - 11
      )}║`,
      `${indent}║ Model: ${details.model}${' '.repeat(
        78 - details.model.length - 8
      )}║`,
    ];

    if (details.temperature !== undefined) {
      const tempStr = `Temperature: ${details.temperature}`;
      lines.push(`${indent}║ ${tempStr}${' '.repeat(78 - tempStr.length)}║`);
    }

    if (details.maxTokens !== undefined) {
      const tokStr = `Max Tokens: ${details.maxTokens}`;
      lines.push(`${indent}║ ${tokStr}${' '.repeat(78 - tokStr.length)}║`);
    }

    lines.push(`${indent}╠${'═'.repeat(78)}╣`);
    lines.push(
      `${indent}║ PROMPT (${details.promptLength} chars)${' '.repeat(
        78 - details.promptLength.toString().length - 15
      )}║`
    );

    const promptLines = this.wrapText(details.prompt, 76);
    promptLines.slice(0, 10).forEach((line) => {
      lines.push(`${indent}║ ${line}${' '.repeat(78 - line.length)}║`);
    });

    if (promptLines.length > 10) {
      lines.push(
        `${indent}║ ... (${promptLines.length - 10} more lines)${' '.repeat(
          78 - (promptLines.length - 10).toString().length - 20
        )}║`
      );
    }

    if (details.response) {
      lines.push(`${indent}╠${'═'.repeat(78)}╣`);
      lines.push(
        `${indent}║ RESPONSE (${details.responseLength} chars)${' '.repeat(
          78 - (details.responseLength?.toString().length || 0) - 17
        )}║`
      );

      const responseLines = this.wrapText(details.response, 76);
      responseLines.slice(0, 10).forEach((line) => {
        lines.push(`${indent}║ ${line}${' '.repeat(78 - line.length)}║`);
      });

      if (responseLines.length > 10) {
        lines.push(
          `${indent}║ ... (${responseLines.length - 10} more lines)${' '.repeat(
            78 - (responseLines.length - 10).toString().length - 20
          )}║`
        );
      }
    }

    if (details.error) {
      lines.push(`${indent}╠${'═'.repeat(78)}╣`);
      lines.push(`${indent}║ ❌ ERROR${' '.repeat(70)}║`);
      const errorLines = this.wrapText(details.error, 76);
      errorLines.forEach((line) => {
        lines.push(`${indent}║ ${line}${' '.repeat(78 - line.length)}║`);
      });
    }

    lines.push(`${indent}╠${'═'.repeat(78)}╣`);

    if (details.tokensUsed !== undefined) {
      const tokStr = `Tokens Used: ${details.tokensUsed}`;
      lines.push(`${indent}║ ${tokStr}${' '.repeat(78 - tokStr.length)}║`);
    }

    if (details.durationMs !== undefined) {
      const durStr = `Duration: ${details.durationMs}ms`;
      lines.push(`${indent}║ ${durStr}${' '.repeat(78 - durStr.length)}║`);
    }

    lines.push(`${indent}╚${'═'.repeat(78)}╝`);
    lines.push('');

    this.appendToLog(jobId, lines.join('\n'));
  }

  /**
   * Finalize logging for a job
   */
  async finalizeJobLogging(
    jobId: string,
    summary: {
      status: string;
      durationMs: number;
      objectsCreated?: number;
      relationshipsCreated?: number;
      error?: string;
    }
  ): Promise<void> {
    const timestamp = new Date().toISOString();

    const footer = [
      '',
      '='.repeat(100),
      `EXTRACTION JOB COMPLETED - ${jobId}`,
      `Completed: ${timestamp}`,
      `Status: ${summary.status}`,
      `Duration: ${summary.durationMs}ms (${(summary.durationMs / 1000).toFixed(
        2
      )}s)`,
    ];

    if (summary.objectsCreated !== undefined) {
      footer.push(`Objects Created: ${summary.objectsCreated}`);
    }

    if (summary.relationshipsCreated !== undefined) {
      footer.push(`Relationships Created: ${summary.relationshipsCreated}`);
    }

    if (summary.error) {
      footer.push(`Error: ${summary.error}`);
    }

    footer.push('='.repeat(100));

    this.appendToLog(jobId, footer.join('\n'));

    // Final flush
    await this.flushLogBuffer(jobId);

    // Cleanup
    this.logBuffers.delete(jobId);
    this.contextStack.delete(jobId);
    const timer = this.flushTimers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.flushTimers.delete(jobId);
    }

    this.logger.log(`Finalized verbose logging for job ${jobId}`);
  }

  /**
   * Append text to log buffer (will be flushed periodically)
   */
  private appendToLog(jobId: string, text: string): void {
    const buffer = this.logBuffers.get(jobId) || [];
    buffer.push(text);
    this.logBuffers.set(jobId, buffer);

    const bufferSize = buffer.reduce((sum, entry) => sum + entry.length, 0);
    const MAX_BUFFER_SIZE = 10 * 1024 * 1024; // 10MB max buffer
    const MAX_BUFFER_ENTRIES = 1000; // Max 1000 log entries

    // Immediate flush if buffer is too large (memory protection)
    if (bufferSize >= MAX_BUFFER_SIZE || buffer.length >= MAX_BUFFER_ENTRIES) {
      this.logger.warn(
        `Force flushing log buffer for job ${jobId} (size: ${Math.round(
          bufferSize / 1024
        )}KB, entries: ${buffer.length})`
      );
      // Use void to explicitly ignore promise (fire-and-forget for immediate flush)
      void this.flushLogBuffer(jobId);
    } else if (buffer.length >= 100) {
      // Auto-flush if buffer gets large (every 100 entries)
      void this.flushLogBuffer(jobId);
    } else {
      // Schedule flush
      this.scheduleFlush(jobId);
    }
  }

  /**
   * Schedule buffer flush
   */
  private scheduleFlush(jobId: string): void {
    const existingTimer = this.flushTimers.get(jobId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      // Properly handle async flush in setTimeout callback
      void this.flushLogBuffer(jobId).catch((error) => {
        this.logger.error(`Scheduled flush failed for job ${jobId}`, error);
      });
    }, 1000); // Flush every 1 second

    this.flushTimers.set(jobId, timer);
  }

  /**
   * Flush log buffer to file
   */
  private async flushLogBuffer(jobId: string): Promise<void> {
    const buffer = this.logBuffers.get(jobId);
    if (!buffer || buffer.length === 0) {
      return;
    }

    const logFile = this.getLogFilePath(jobId);
    const content = buffer.join('\n') + '\n';

    try {
      await fs.appendFile(logFile, content);
      this.logBuffers.set(jobId, []); // Clear buffer
    } catch (error) {
      this.logger.error(`Failed to flush log buffer for job ${jobId}`, error);
    }
  }

  /**
   * Get log file path for a job
   */
  private getLogFilePath(jobId: string): string {
    return path.join(this.logDir, `${jobId}.log`);
  }

  /**
   * Format value for logging
   */
  private formatValue(value: any): string {
    if (value === null || value === undefined) {
      return String(value);
    }

    if (typeof value === 'string') {
      return value.length > 100
        ? `"${value.substring(0, 100)}..." (${value.length} chars)`
        : `"${value}"`;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      return `Array(${value.length})`;
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value);
      if (keys.length === 0) {
        return '{}';
      }
      return `{ ${keys.slice(0, 3).join(', ')}${
        keys.length > 3 ? ', ...' : ''
      } }`;
    }

    return String(value);
  }

  /**
   * Wrap text to specified width
   */
  private wrapText(text: string, width: number): string[] {
    const lines: string[] = [];
    const words = text.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      if (currentLine.length + word.length + 1 <= width) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) {
          lines.push(currentLine);
        }
        currentLine = word;
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines;
  }
}

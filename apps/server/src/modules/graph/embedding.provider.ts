import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

/**
 * Result from an embedding generation call, including usage info for tracking
 */
export interface EmbeddingResult {
  /** The embedding vector */
  embedding: number[];
  /** Token usage information (if available from provider) */
  usage?: {
    /** Number of tokens in the input text */
    promptTokens?: number;
    /** Total tokens processed (usually same as promptTokens for embeddings) */
    totalTokens?: number;
  };
  /** Model used for embedding */
  model?: string;
}

export interface EmbeddingProvider {
  generate(text: string): Promise<EmbeddingResult>;
}

/**
 * Deterministic SHA256-based dummy embedding provider used when no external embedding
 * service is configured. Produces a 768-dim pseudo-vector derived from the hash.
 * Returns no usage info since it's not using a real API.
 */
@Injectable()
export class DummySha256EmbeddingProvider implements EmbeddingProvider {
  async generate(text: string): Promise<EmbeddingResult> {
    const hash = createHash('sha256').update(text).digest();
    const target = 768; // Match embedding_v2 dimension
    const out: number[] = [];
    for (let i = 0; i < target; i++) {
      // Normalize to [-1, 1] range like real embeddings
      out.push((hash[i % hash.length] / 255) * 2 - 1);
    }
    return {
      embedding: out,
      model: 'dummy-sha256',
      // No usage info for dummy provider
    };
  }
}

/**
 * Future: Real provider (e.g. Vertex AI) would implement EmbeddingProvider and be bound
 * conditionally in the module based on config / env. For now we export only dummy implementation.
 */

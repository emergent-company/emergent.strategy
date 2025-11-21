import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export interface EmbeddingProvider {
  generate(text: string): Promise<number[]>;
}

/**
 * Deterministic SHA256-based dummy embedding provider used when no external embedding
 * service is configured. Produces a 128-byte pseudo-vector derived from the hash.
 */
@Injectable()
export class DummySha256EmbeddingProvider implements EmbeddingProvider {
  async generate(text: string): Promise<number[]> {
    const hash = createHash('sha256').update(text).digest();
    const target = 768; // Match embedding_v2 dimension
    const out: number[] = [];
    for (let i = 0; i < target; i++) {
      // Normalize to [-1, 1] range like real embeddings
      out.push((hash[i % hash.length] / 255) * 2 - 1);
    }
    return out;
  }
}

/**
 * Future: Real provider (e.g. Vertex AI) would implement EmbeddingProvider and be bound
 * conditionally in the module based on config / env. For now we export only dummy implementation.
 */

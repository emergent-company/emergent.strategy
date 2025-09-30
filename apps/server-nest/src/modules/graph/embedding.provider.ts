import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

export interface EmbeddingProvider {
    generate(text: string): Promise<Buffer>;
}

/**
 * Deterministic SHA256-based dummy embedding provider used when no external embedding
 * service is configured. Produces a 128-byte pseudo-vector derived from the hash.
 */
@Injectable()
export class DummySha256EmbeddingProvider implements EmbeddingProvider {
    async generate(text: string): Promise<Buffer> {
        const hash = createHash('sha256').update(text).digest();
        const target = 128;
        const out = Buffer.alloc(target);
        for (let i = 0; i < target; i++) out[i] = hash[i % hash.length];
        return out;
    }
}

/**
 * Future: Real provider (e.g. Vertex AI) would implement EmbeddingProvider and be bound
 * conditionally in the module based on config / env. For now we export only dummy implementation.
 */

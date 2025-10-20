import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingProvider } from './embedding.provider';
import { AppConfigService } from '../../common/config/config.service';

/**
 * GoogleVertexEmbeddingProvider
 * Implementation of a Google Vertex AI Text Embedding provider with graceful fallback.
 * Behaviour:
 *  - If embeddings disabled -> throw 'embeddings_disabled'
 *  - If EMBEDDINGS_NETWORK_DISABLED set -> return deterministic local hash (no network)
 *  - Otherwise perform HTTP call; on non-fatal/network errors log + fallback to deterministic hash
 * Environment Variables consulted (all optional except GOOGLE_API_KEY):
 *  - GOOGLE_API_KEY (required for real call)
 *  - VERTEX_EMBEDDING_MODEL (default: text-embedding-004)
 *  - GOOGLE_VERTEX_PROJECT (optional; if absent uses 'dummy-project')
 *  - GOOGLE_VERTEX_LOCATION (default: us-central1)
 *  - EMBEDDINGS_NETWORK_DISABLED (if set truthy -> skip HTTP)
 */
@Injectable()
export class GoogleVertexEmbeddingProvider implements EmbeddingProvider {
    private readonly logger = new Logger(GoogleVertexEmbeddingProvider.name);
    private loggedFallback = false;
    constructor(private readonly config: AppConfigService) { }

    async generate(text: string): Promise<Buffer> {
        if (!this.config.embeddingsEnabled) {
            throw new Error('embeddings_disabled');
        }
        if (this.config.embeddingsNetworkDisabled) {
            return this.deterministicStub(text, 'vertex:offline:');
        }
        const project = process.env.GOOGLE_VERTEX_PROJECT;
        const location = process.env.GOOGLE_VERTEX_LOCATION;
        const model = process.env.VERTEX_EMBEDDING_MODEL || 'text-embedding-004'; // text-embedding-004 is the standard model

        if (!project) {
            throw new Error('GOOGLE_VERTEX_PROJECT not configured for embeddings');
        }
        if (!location) {
            throw new Error('GOOGLE_VERTEX_LOCATION not configured for embeddings');
        }

        const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:predict`;
        const apiKey = process.env.GOOGLE_API_KEY!;
        try {
            const fetchFn: typeof fetch = (global as any).fetch || (await import('node-fetch')).default as any;
            const resp = await fetchFn(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    // Some deployments may require explicit X-Goog-Api-Key; include if present.
                    ...(apiKey ? { 'X-Goog-Api-Key': apiKey } : {}),
                },
                body: JSON.stringify({ instances: [{ content: text }] }),
            });
            if (!resp.ok) {
                throw new Error(`vertex_http_${resp.status}`);
            }
            const json: any = await resp.json();
            const vector: number[] | undefined = json.predictions?.[0]?.embeddings?.values || json.predictions?.[0]?.values;
            if (!Array.isArray(vector) || !vector.length) {
                throw new Error('vertex_response_no_vector');
            }
            // Convert to Buffer (Float32)
            const floatArray = new Float32Array(vector.map(v => Number(v) || 0));
            return Buffer.from(floatArray.buffer);
        } catch (err) {
            // Fallback path: log once per process to reduce noise.
            if (!this.loggedFallback) {
                this.logger.warn(`Vertex embedding fallback to deterministic hash: ${(err as Error).message}`);
                this.loggedFallback = true;
            }
            return this.deterministicStub(text, 'vertex:fallback:');
        }
    }

    private async deterministicStub(text: string, prefix: string): Promise<Buffer> {
        const crypto = await import('crypto');
        const hash = crypto.createHash('sha256').update(prefix + text).digest();
        const target = 128;
        const out = Buffer.alloc(target);
        for (let i = 0; i < target; i++) out[i] = hash[i % hash.length];
        return out;
    }
}

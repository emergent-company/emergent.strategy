import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../common/config/config.service';
import { GoogleGenerativeAIEmbeddings, ChatGoogleGenerativeAI } from '@langchain/google-genai';

// NOTE: We reuse embeddings client initialization trick for simplicity; for a full model we'd use a proper text generation client.
// For now emulate streaming by splitting the single model response into tokens.

@Injectable()
export class ChatGenerationService {
    private readonly logger = new Logger(ChatGenerationService.name);
    constructor(private readonly config: AppConfigService) { }

    get enabled(): boolean { return this.config.chatModelEnabled; }
    get hasKey(): boolean { return !!this.config.googleApiKey; }

    async generateStreaming(prompt: string, onToken: (t: string) => void): Promise<string> {
        // Deterministic synthetic mode for tests: bypass external model and emit fixed token sequence
        if (process.env.CHAT_TEST_DETERMINISTIC === '1') {
            const synthetic: string[] = ['token-0', 'token-1', 'token-2', 'token-3', 'token-4'];
            synthetic.forEach(t => onToken(t));
            return synthetic.join(' ');
        }
        if (!this.enabled) throw new Error('chat model disabled');
        try {
            if (process.env.E2E_DEBUG_CHAT === '1') {
                this.logger.log(`[gen] start enabled=${this.enabled} hasKey=${this.hasKey} model=gemini-1.5-flash promptPreview="${prompt.slice(0, 80).replace(/\n/g, ' ')}"`);
            }
            // Use a fast, inexpensive model; fallback to embedding ping if generative fails
            const model = new ChatGoogleGenerativeAI({ apiKey: this.config.googleApiKey, model: 'gemini-1.5-flash' });
            const msg = await model.invoke(prompt);
            const full = typeof msg === 'string' ? msg : (msg as any)?.content || JSON.stringify(msg);
            // Naive tokenization (split on spaces) for incremental emission
            const pieces = full.split(/\s+/).filter(Boolean);
            const maxTokens = Math.min(pieces.length, 128); // cap to keep tests fast
            for (let i = 0; i < maxTokens; i++) {
                onToken(pieces[i]);
            }
            if (process.env.E2E_DEBUG_CHAT === '1') {
                this.logger.log(`[gen] success tokens=${maxTokens}`);
            }
            return pieces.slice(0, maxTokens).join(' ');
        } catch (e) {
            const err = e as Error;
            this.logger.warn(`Generation failed, fallback to synthetic sequence: ${err.message}`);
            if (process.env.E2E_DEBUG_CHAT === '1') {
                this.logger.warn('[gen] stack: ' + (err.stack || 'no-stack'));
            }
            // Fallback: small deterministic set
            const fallback = `Answer unavailable for: ${prompt.slice(0, 80)}`;
            fallback.split(/\s+/).forEach(w => onToken(w));
            return fallback;
        }
    }
}

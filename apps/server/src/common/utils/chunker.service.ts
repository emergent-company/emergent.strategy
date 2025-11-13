import { Injectable } from '@nestjs/common';

@Injectable()
export class ChunkerService {
    chunk(text: string, maxLen = 1200): string[] {
        const chunks: string[] = [];
        let start = 0;
        while (start < text.length) {
            const end = Math.min(start + maxLen, text.length);
            chunks.push(text.slice(start, end));
            start = end;
        }
        return chunks;
    }
}

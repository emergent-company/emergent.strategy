import { describe, it, expect } from 'vitest';
import { ChunkerService } from '../../src/common/utils/chunker.service';

describe('ChunkerService', () => {
    const svc = new ChunkerService();

    it('returns empty array for empty string', () => {
        expect(svc.chunk('', 100)).toEqual([]);
    });

    it('returns single chunk when input shorter than max', () => {
        const text = 'short text';
        const chunks = svc.chunk(text, 100);
        expect(chunks).toEqual([text]);
    });

    it('splits into multiple chunks on boundary respecting max length', () => {
        const text = 'a'.repeat(120);
        const chunks = svc.chunk(text, 50);
        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks.every(c => c.length <= 50)).toBe(true);
        expect(chunks.join('')).toBe(text);
    });
});

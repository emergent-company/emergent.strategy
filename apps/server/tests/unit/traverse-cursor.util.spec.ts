import { describe, it, expect } from 'vitest';
import { encodeTraverseCursor, decodeTraverseCursor } from '../../src/modules/graph/traverse-cursor.util';

describe('traverse-cursor.util', () => {
    it('round-trips a valid cursor', () => {
        const c = encodeTraverseCursor(2, 'node-123');
        const decoded = decodeTraverseCursor(c);
        expect(decoded).toEqual({ d: 2, id: 'node-123' });
    });

    it('returns null for missing/empty cursor', () => {
        expect(decodeTraverseCursor(undefined)).toBeNull();
        expect(decodeTraverseCursor(null)).toBeNull();
        expect(decodeTraverseCursor('')).toBeNull();
    });

    it('returns null for malformed base64 input', () => {
        expect(decodeTraverseCursor('@@not-base64@@')).toBeNull();
    });

    it('returns null for JSON missing required fields', () => {
        const bad = Buffer.from(JSON.stringify({ depth: 1, id: 'x' })).toString('base64url');
        expect(decodeTraverseCursor(bad)).toBeNull();
    });

    it('returns null for wrong field types', () => {
        const bad = Buffer.from(JSON.stringify({ d: 'not-a-number', id: 123 })).toString('base64url');
        expect(decodeTraverseCursor(bad)).toBeNull();
    });
});

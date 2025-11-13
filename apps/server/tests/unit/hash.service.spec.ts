import { describe, it, expect } from 'vitest';
import { HashService } from '../../src/common/utils/hash.service';

describe('HashService', () => {
    const svc = new HashService();

    it('produces stable deterministic hash for same input', () => {
        const a = svc.sha256('hello world');
        const b = svc.sha256('hello world');
        expect(a).toBe(b);
    });

    it('produces different hashes for different inputs (low collision sanity)', () => {
        const h1 = svc.sha256('alpha');
        const h2 = svc.sha256('beta');
        expect(h1).not.toBe(h2);
    });
});

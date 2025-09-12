import { expect } from 'vitest';

/** Utility assertion helpers for E2E specs (shared, typed, no 'any'). */

export function expectStatusOneOf(actual: number, allowed: ReadonlyArray<number>, context?: string): void {
    if (!allowed.includes(actual)) {
        throw new Error(`Unexpected status ${actual}; allowed=${allowed.join(',')} ${context ? 'context=' + context : ''}`);
    }
}

export function expectNonEmptyResults<T extends { length: number }>(arr: T, label = 'results'): void {
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBeGreaterThan(0);
}

export function expectDisjointIds(a: { id: string }[], b: { id: string }[]): void {
    const set = new Set(a.map(r => r.id));
    const overlap = b.some(r => set.has(r.id));
    if (overlap) {
        throw new Error('Expected disjoint result sets between paginated slices');
    }
}

export function withRetry<T>(fn: () => Promise<T>, opts: { retries?: number; delayMs?: number } = {}): Promise<T> {
    const { retries = 2, delayMs = 60 } = opts;
    let attempt = 0;
    const attemptFn = async (): Promise<T> => {
        try {
            return await fn();
        } catch (err) {
            if (attempt >= retries) throw err;
            attempt++;
            if (delayMs) await new Promise(r => setTimeout(r, delayMs));
            return attemptFn();
        }
    };
    return attemptFn();
}

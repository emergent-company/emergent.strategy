// Shared vector helpers for tests to avoid zero-norm cosine issues and reduce duplication.

/** Small epsilon used to ensure non-zero norm for cosine distance calculations. */
export const VECTOR_EPS = 0.000001;

/** Returns a fresh 768-dim base vector with a tiny epsilon in the first dimension. */
export function baseVec(): number[] {
    const v = Array(768).fill(0).map(() => 0);
    v[0] = VECTOR_EPS;
    return v;
}

/**
 * Creates a variant of a base vector with a modified value at index 0 (or provided index).
 * Keeps other dimensions identical for predictable distance ordering.
 */
export function variantVec(magnitude: number, index = 0): number[] {
    const v = baseVec();
    v[index] = magnitude;
    return v;
}

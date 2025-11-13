// Deterministic placeholder embedding service.
// Produces a fixed-length numeric vector derived from the query string.
export class EmbeddingService {
  private readonly dimension = 12;

  async embedQuery(text: string): Promise<number[]> {
    const vec = new Array(this.dimension).fill(0);
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      vec[i % this.dimension] += (code % 51) / 255; // bounded contribution
    }
    // simple L2 normalize
    const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
    return vec.map((v) => v / norm);
  }
}

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Regression test: ensure both legacy (minScore) and preferred (maxDistance)
// are present in OpenAPI spec for vector similarity endpoints.

describe('OpenAPI Vector Alias Documentation', () => {
  it('documents both minScore and maxDistance for vector-search endpoints', () => {
    const p = path.join(__dirname, '../../../openapi.json');
    const raw = fs.readFileSync(p, 'utf-8');
    const doc = JSON.parse(raw);
    const post = doc.paths?.['/graph/objects/vector-search']?.post;
    expect(post).toBeTruthy();
    const getSimilar = doc.paths?.['/graph/objects/{id}/similar']?.get;
    expect(getSimilar).toBeTruthy();
    // Resolve $ref for request body schema (VectorSearchDto)
    const ref =
      post.requestBody?.content?.['application/json']?.schema?.['$ref'];
    expect(ref).toBeTruthy();
    const refName = ref.split('/').pop();
    const schema = doc.components?.schemas?.[refName];
    expect(schema).toBeTruthy();
    const props = schema.properties || {};
    expect(props.minScore).toBeTruthy();
    expect(props.maxDistance).toBeTruthy();
    // GET query parameters list should include both
    const qp = (getSimilar.parameters || []).map((p: any) => p.name);
    expect(qp).toContain('minScore');
    expect(qp).toContain('maxDistance');
  });
});

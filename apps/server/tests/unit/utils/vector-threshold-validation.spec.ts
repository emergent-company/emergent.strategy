import { validate } from 'class-validator';
import { describe, it, expect } from 'vitest';
import { VectorSearchDto } from '../../../src/modules/graph/dto/vector-search.dto';
import { SimilarVectorSearchQueryDto } from '../../../src/modules/graph/dto/similar-vector-search.dto';

describe('Vector threshold validation', () => {
  it('rejects negative minScore / maxDistance', async () => {
    const dto = new VectorSearchDto();
    dto.vector = [0.1];
    dto.minScore = -0.1 as any;
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'minScore')).toBe(true);
  });

  it('rejects minScore over 2', async () => {
    const dto = new VectorSearchDto();
    dto.vector = [0.1];
    dto.minScore = 3 as any;
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'minScore')).toBe(true);
  });

  it('rejects maxDistance over 2 precedence still enforced', async () => {
    const dto = new VectorSearchDto();
    dto.vector = [0.1];
    dto.maxDistance = 5 as any;
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'maxDistance')).toBe(true);
  });

  it('accepts valid range and precedence (maxDistance overrides)', async () => {
    const dto = new VectorSearchDto();
    dto.vector = [0.1];
    dto.minScore = 0.4 as any;
    dto.maxDistance = 0.2 as any;
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('similar DTO invalid negative', async () => {
    const dto = new SimilarVectorSearchQueryDto();
    dto.minScore = -1 as any;
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'minScore')).toBe(true);
  });
});

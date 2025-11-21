import { z } from 'zod';
import { UnifiedSchemaFactory } from '../../../src/modules/extraction-jobs/unified-schema.factory';
import { EXTRACTION_SCHEMAS } from '../../../src/modules/extraction-jobs/schemas';

describe('UnifiedSchemaFactory', () => {
  it('should create a unified schema for specified types', () => {
    const types = ['Requirement', 'Risk'];
    const { schema, keyToType } =
      UnifiedSchemaFactory.createUnifiedSchema(types);

    // Check schema structure
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    expect(shape).toHaveProperty('requirements');
    expect(shape).toHaveProperty('risks');
    expect(Object.keys(shape)).toHaveLength(2);

    // Check key mapping
    expect(keyToType).toEqual({
      requirements: 'Requirement',
      risks: 'Risk',
    });
  });

  it('should handle types with no schema gracefully', () => {
    const types = ['Requirement', 'UnknownType'];
    const { schema, keyToType } =
      UnifiedSchemaFactory.createUnifiedSchema(types);

    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    expect(shape).toHaveProperty('requirements');
    expect(shape).not.toHaveProperty('unknowntypes');

    expect(keyToType).toEqual({
      requirements: 'Requirement',
    });
  });

  it('should allow parsing valid data', () => {
    const types = ['Requirement'];
    const { schema } = UnifiedSchemaFactory.createUnifiedSchema(types);

    const validData = {
      requirements: [
        {
          name: 'Req 1',
          description: 'Must do X',
          priority: 'high',
          confidence: 0.9,
        },
      ],
    };

    const result = schema.parse(validData);
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].name).toBe('Req 1');
  });
});

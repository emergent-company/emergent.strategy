import { z } from 'zod';
import { getSchemaForType } from './schemas';

export class UnifiedSchemaFactory {
  /**
   * Creates a unified Zod schema that contains arrays for all requested entity types.
   * Returns both the Zod schema and a mapping from schema keys to entity type names.
   *
   * @param allowedTypes List of entity type names to include (e.g. ['Requirement', 'Risk'])
   * @param objectSchemas JSON Schema definitions from template pack (optional, for dynamic types)
   */
  static createUnifiedSchema(
    allowedTypes: string[],
    objectSchemas?: Record<string, any>
  ) {
    const shape: Record<string, z.ZodTypeAny> = {};
    const keyToType: Record<string, string> = {};

    for (const type of allowedTypes) {
      // Try to get hardcoded Zod schema first
      let zodSchema = getSchemaForType(type);

      // If no hardcoded schema exists, try to create one from JSON Schema
      if (!zodSchema && objectSchemas && objectSchemas[type]) {
        zodSchema = this.jsonSchemaToZod(objectSchemas[type], type);
      }

      if (zodSchema) {
        // Create a key like "requirements" from "Requirement"
        // Simple pluralization: lowercase + 's'
        const key = type.toLowerCase() + 's';

        shape[key] = z
          .array(zodSchema)
          .describe(`List of extracted ${type} entities`)
          .optional()
          .default([]);

        keyToType[key] = type;
      }
    }

    return {
      // The unified Zod schema
      schema: z.object(shape).describe('Extracted entities grouped by type'),
      // Mapping to resolve keys back to original type names (e.g. 'requirements' -> 'Requirement')
      keyToType,
    };
  }

  /**
   * Convert JSON Schema to Zod schema dynamically.
   * This is a simplified converter that handles the common cases for our extraction schemas.
   */
  private static jsonSchemaToZod(
    jsonSchema: any,
    typeName: string
  ): z.ZodTypeAny {
    const shape: Record<string, z.ZodTypeAny> = {};

    // Always include base fields that all entities need
    shape.name = z.string().describe('Name of the entity');
    shape.description = z
      .string()
      .optional()
      .describe('Description of the entity');
    shape.confidence = z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe('Confidence score (0.0-1.0)');

    // Add custom properties from JSON Schema
    if (jsonSchema.properties) {
      for (const [propName, propDef] of Object.entries(jsonSchema.properties)) {
        const prop = propDef as any;

        // Skip if already defined (name, description, confidence)
        if (shape[propName]) continue;

        // Convert JSON Schema type to Zod type
        let zodType: z.ZodTypeAny;

        switch (prop.type) {
          case 'string':
            zodType = z.string();
            break;
          case 'number':
          case 'integer':
            zodType = z.number();
            break;
          case 'boolean':
            zodType = z.boolean();
            break;
          case 'array':
            // Handle array types
            if (prop.items?.type === 'string') {
              zodType = z.array(z.string());
            } else if (prop.items?.type === 'number') {
              zodType = z.array(z.number());
            } else {
              zodType = z.array(z.any());
            }
            break;
          case 'object':
            zodType = z.record(z.any());
            break;
          default:
            zodType = z.any();
        }

        // Handle enums
        if (prop.enum && Array.isArray(prop.enum)) {
          zodType = z.enum(prop.enum as [string, ...string[]]);
        }

        // Make optional if not required
        const isRequired =
          jsonSchema.required && jsonSchema.required.includes(propName);
        if (!isRequired) {
          zodType = zodType.optional();
        }

        // Add description
        if (prop.description) {
          zodType = zodType.describe(prop.description);
        }

        shape[propName] = zodType;
      }
    }

    return z.object(shape).describe(`Extracted ${typeName} entity`);
  }
}

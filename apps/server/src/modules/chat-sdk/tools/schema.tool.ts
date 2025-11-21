import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { TypeRegistryService } from '../../type-registry/type-registry.service';

export interface SchemaToolContext {
  projectId: string;
}

/**
 * Create a LangChain tool for retrieving the database schema
 */
export function createGetDatabaseSchemaTool(
  typeRegistry: TypeRegistryService,
  context: SchemaToolContext
) {
  return new DynamicStructuredTool({
    name: 'get_database_schema',
    description: `Get a list of object types available in the current project, including their description and simplified property schema.
Use this tool when you need to understand the data model or available types in the system.`,
    schema: z.object({}) as any,
    func: async (): Promise<string> => {
      try {
        // Get types from TypeRegistryService
        const types = await typeRegistry.getProjectTypes(context.projectId, {
          enabled_only: true,
        });

        const simplifiedTypes = types.map((t) => ({
          type: t.type,
          description: t.description,
          properties:
            t.json_schema &&
            typeof t.json_schema === 'object' &&
            'properties' in t.json_schema
              ? Object.entries((t.json_schema as any).properties).map(
                  ([key, prop]: [string, any]) => ({
                    name: key,
                    type: prop.type,
                    description: prop.description,
                  })
                )
              : [],
        }));

        return JSON.stringify(simplifiedTypes, null, 2);
      } catch (error) {
        return JSON.stringify({
          error: 'Failed to fetch schema',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });
}

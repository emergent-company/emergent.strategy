/**
 * List Services Tool
 *
 * Lists configured services without checking health.
 * Fast operation that returns service definitions.
 */

import { listServices, loadEnvironmentVariables } from '../workspace-client.js';

export const listServicesSchema = {
  type: 'object' as const,
  properties: {},
  required: [],
};

export interface ListServicesInput {
  // No input parameters
}

export async function listServicesTool(
  _input: ListServicesInput
): Promise<string> {
  // Load environment variables
  loadEnvironmentVariables();

  const services = listServices();
  const lines: string[] = [];

  lines.push('# Configured Services');
  lines.push('');
  lines.push(
    'These are the application services managed by the workspace. Use `get_status` for health information.'
  );
  lines.push('');

  for (const service of services) {
    lines.push(`## ${service.name}`);
    lines.push(`- Type: ${service.type}`);
    if (service.port) lines.push(`- Port: ${service.port}`);
    if (service.healthCheckUrl)
      lines.push(`- Health URL: ${service.healthCheckUrl}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('### Available Dependencies');
  lines.push('');
  lines.push(
    'Use `health_check` with target parameter to check specific dependencies:'
  );
  lines.push('- `postgres` / `db` - PostgreSQL database');
  lines.push('- `zitadel` / `auth` - Zitadel authentication');
  lines.push('- `vertex` / `ai` / `gemini` - Vertex AI / Gemini');
  lines.push('- `langfuse` - Langfuse observability');
  lines.push('- `langsmith` - LangSmith observability');

  return lines.join('\n');
}

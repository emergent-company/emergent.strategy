/**
 * Health Check Tool
 *
 * Check health of a specific service or dependency.
 */

import {
  getServiceHealth,
  getDependencyHealth,
  loadEnvironmentVariables,
} from '../workspace-client.js';

export const healthCheckSchema = {
  type: 'object' as const,
  properties: {
    target: {
      type: 'string',
      description:
        'Service or dependency to check. Services: "admin", "server". Dependencies: "postgres", "zitadel", "vertex", "langfuse", "langsmith"',
    },
  },
  required: ['target'],
};

export interface HealthCheckInput {
  target: string;
}

export async function healthCheckTool(
  input: HealthCheckInput
): Promise<string> {
  const { target } = input;

  // Load environment variables
  loadEnvironmentVariables();

  const lines: string[] = [];

  // Try as service first
  const serviceHealth = await getServiceHealth(target);
  if (serviceHealth) {
    const status = serviceHealth.healthy
      ? 'HEALTHY'
      : serviceHealth.running
      ? 'DEGRADED'
      : 'DOWN';

    lines.push(`# Service: ${serviceHealth.name}`);
    lines.push('');
    lines.push(`**Status:** ${status}`);
    lines.push('');
    lines.push(`- Type: ${serviceHealth.type}`);
    lines.push(`- Running: ${serviceHealth.running ? 'Yes' : 'No'}`);
    lines.push(`- Healthy: ${serviceHealth.healthy ? 'Yes' : 'No'}`);
    if (serviceHealth.pid) lines.push(`- PID: ${serviceHealth.pid}`);
    if (serviceHealth.port) lines.push(`- Port: ${serviceHealth.port}`);
    if (serviceHealth.url) lines.push(`- Health URL: ${serviceHealth.url}`);
    if (serviceHealth.latencyMs)
      lines.push(`- Latency: ${serviceHealth.latencyMs}ms`);
    if (serviceHealth.error) lines.push(`- Error: ${serviceHealth.error}`);

    return lines.join('\n');
  }

  // Try as dependency
  const depHealth = await getDependencyHealth(target);
  if (depHealth) {
    const status = depHealth.connected
      ? 'CONNECTED'
      : depHealth.configured
      ? 'DISCONNECTED'
      : 'NOT CONFIGURED';

    lines.push(`# Dependency: ${depHealth.name}`);
    lines.push('');
    lines.push(`**Status:** ${status}`);
    lines.push('');
    lines.push(`- Type: ${depHealth.type}`);
    lines.push(`- Configured: ${depHealth.configured ? 'Yes' : 'No'}`);
    lines.push(`- Connected: ${depHealth.connected ? 'Yes' : 'No'}`);
    if (depHealth.latencyMs) lines.push(`- Latency: ${depHealth.latencyMs}ms`);
    if (depHealth.version) lines.push(`- Version: ${depHealth.version}`);
    if (depHealth.error) lines.push(`- Error: ${depHealth.error}`);
    if (depHealth.details) {
      lines.push('');
      lines.push('**Details:**');
      lines.push('```json');
      lines.push(JSON.stringify(depHealth.details, null, 2));
      lines.push('```');
    }

    return lines.join('\n');
  }

  // Not found
  return `Unknown target: "${target}"\n\nValid targets:\n- Services: admin, server\n- Dependencies: postgres, zitadel, vertex, langfuse, langsmith`;
}

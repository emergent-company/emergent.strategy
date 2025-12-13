/**
 * Get Status Tool
 *
 * Returns comprehensive workspace health status including services,
 * dependencies, API keys, and test accounts.
 */

import {
  getWorkspaceHealth,
  loadEnvironmentVariables,
} from '../workspace-client.js';

export const getStatusSchema = {
  type: 'object' as const,
  properties: {
    verbose: {
      type: 'boolean',
      description:
        'Include detailed information for each service and dependency (default: false)',
    },
  },
  required: [],
};

export interface GetStatusInput {
  verbose?: boolean;
}

export async function getStatusTool(input: GetStatusInput): Promise<string> {
  const { verbose = false } = input;

  // Load environment variables
  loadEnvironmentVariables();

  const health = await getWorkspaceHealth();
  const lines: string[] = [];

  // Header
  lines.push('# Workspace Health Status');
  lines.push('');
  lines.push(`**Timestamp:** ${health.timestamp}`);
  lines.push(`**Mode:** ${health.mode}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  const s = health.summary;
  lines.push(`- Services: ${s.servicesHealthy}/${s.servicesTotal} healthy`);
  lines.push(
    `- Dependencies: ${s.dependenciesConnected}/${s.dependenciesTotal} connected`
  );
  lines.push(`- API Keys: ${s.apiKeysConfigured}/${s.apiKeysTotal} configured`);
  lines.push(
    `- Test Accounts: ${s.testAccountsConfigured}/${s.testAccountsTotal} configured`
  );
  lines.push(`- **Overall:** ${s.overallHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
  lines.push('');

  // Services
  lines.push('## Application Services');
  lines.push('');
  for (const service of health.services) {
    const status = service.healthy
      ? '[OK]'
      : service.running
      ? '[DEGRADED]'
      : '[DOWN]';
    lines.push(`### ${service.name} ${status}`);
    lines.push(`- Running: ${service.running ? 'Yes' : 'No'}`);
    lines.push(`- Healthy: ${service.healthy ? 'Yes' : 'No'}`);
    if (service.pid) lines.push(`- PID: ${service.pid}`);
    if (service.port) lines.push(`- Port: ${service.port}`);
    if (service.latencyMs) lines.push(`- Latency: ${service.latencyMs}ms`);
    if (service.error) lines.push(`- Error: ${service.error}`);
    lines.push('');
  }

  // Dependencies
  lines.push('## Dependencies');
  lines.push('');
  for (const dep of health.dependencies) {
    const status = dep.connected
      ? '[OK]'
      : dep.configured
      ? '[DISCONNECTED]'
      : '[NOT CONFIGURED]';
    lines.push(`### ${dep.name} ${status}`);
    lines.push(`- Type: ${dep.type}`);
    lines.push(`- Configured: ${dep.configured ? 'Yes' : 'No'}`);
    lines.push(`- Connected: ${dep.connected ? 'Yes' : 'No'}`);
    if (dep.latencyMs) lines.push(`- Latency: ${dep.latencyMs}ms`);
    if (dep.version) lines.push(`- Version: ${dep.version}`);
    if (dep.error) lines.push(`- Error: ${dep.error}`);
    if (verbose && dep.details) {
      lines.push(`- Details: ${JSON.stringify(dep.details, null, 2)}`);
    }
    lines.push('');
  }

  // API Keys
  lines.push('## API Keys');
  lines.push('');
  for (const key of health.apiKeys) {
    const status = key.configured ? '[CONFIGURED]' : '[MISSING]';
    lines.push(
      `- **${key.name}** ${status}${
        key.maskedValue ? ` (${key.maskedValue})` : ''
      }`
    );
  }
  lines.push('');

  // Test Accounts
  lines.push('## Test Accounts');
  lines.push('');
  for (const account of health.testAccounts) {
    const status = account.configured ? '[CONFIGURED]' : '[MISSING]';
    lines.push(`- **${account.name}** ${status}`);
    if (account.email) lines.push(`  - Email: ${account.email}`);
  }

  return lines.join('\n');
}

/**
 * Service Alias Tools
 *
 * Convenience tools that tail predefined log file combinations.
 *
 * Log structure:
 * logs/
 * ├── server/
 * │   ├── server.log          # Main server log (INFO+)
 * │   ├── server.error.log    # Server errors only
 * │   ├── server.debug.log    # Debug/verbose output
 * │   ├── server.http.log     # HTTP request/response logs
 * │   ├── server.out.log      # Process stdout (from workspace-cli)
 * │   └── server.error.log    # Process stderr (from workspace-cli)
 * ├── admin/
 * │   ├── admin.out.log       # Vite stdout (from workspace-cli)
 * │   ├── admin.error.log     # Vite stderr (from workspace-cli)
 * │   ├── admin.http.log      # HTTP proxy logs (from vite.config.ts)
 * │   └── admin.client.log    # Browser client logs (from /api/logs/client)
 */

import { tailMultipleFiles } from './tail-log.js';

export const aliasSchema = {
  type: 'object' as const,
  properties: {
    lines: {
      type: 'number',
      description: 'Number of lines to retrieve per file (default: 100)',
    },
  },
};

export interface AliasInput {
  lines?: number;
}

/**
 * Tail server application logs (main log and error log)
 */
export async function tailServerLogs(input: AliasInput): Promise<string> {
  const files = ['server/server.log', 'server/server.error.log'];
  return tailMultipleFiles(files, input.lines || 100);
}

/**
 * Tail admin frontend logs (Vite stdout/stderr and client logs)
 */
export async function tailAdminLogs(input: AliasInput): Promise<string> {
  const files = [
    'admin/admin.out.log',
    'admin/admin.error.log',
    'admin/admin.client.log',
  ];
  return tailMultipleFiles(files, input.lines || 100);
}

/**
 * Tail main server application log
 */
export async function tailAppLogs(input: AliasInput): Promise<string> {
  const files = ['server/server.log'];
  return tailMultipleFiles(files, input.lines || 100);
}

/**
 * Tail server debug log
 */
export async function tailDebugLogs(input: AliasInput): Promise<string> {
  const files = ['server/server.debug.log'];
  return tailMultipleFiles(files, input.lines || 100);
}

/**
 * Tail all error logs (server and admin)
 */
export async function tailErrorLogs(input: AliasInput): Promise<string> {
  const files = [
    'server/server.error.log',
    'admin/admin.error.log',
    'admin/admin.client.log',
  ];
  return tailMultipleFiles(files, input.lines || 100);
}

/**
 * Tail HTTP logs (server and admin proxy)
 */
export async function tailHttpLogs(input: AliasInput): Promise<string> {
  const files = ['server/server.http.log', 'admin/admin.http.log'];
  return tailMultipleFiles(files, input.lines || 100);
}

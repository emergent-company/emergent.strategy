import { tool } from '@opencode-ai/plugin';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Custom OpenCode tool to retrieve log entries from application and dependency services.
 *
 * This tool provides AI assistants with instant access to recent log entries using
 * natural language queries. Supports filtering by service type and retrieves both
 * stdout and stderr logs.
 *
 * @example
 * Query: "all" - retrieves logs from all services
 * Query: "server" or "api" - retrieves server logs
 * Query: "admin" or "web" - retrieves admin frontend logs
 * Query: "database" or "postgres" - retrieves postgres logs
 * Query: "admin and server" - retrieves both admin and server logs
 *
 * @returns Formatted log output with service labels
 */
export default tool({
  description:
    'Get recent log entries from application and dependency services. Query examples: "all", "server", "admin", "database", "admin and server"',
  args: {
    query: tool.schema
      .string()
      .optional()
      .default('all')
      .describe(
        'Which logs to retrieve. Options: all, admin, web, server, api, database, postgres, db, zitadel, or combinations like "admin and server"'
      ),
    lines: tool.schema
      .number()
      .optional()
      .default(50)
      .describe('Number of lines to retrieve from each log file (default: 50)'),
  },
  async execute(args) {
    const query = args.query.toLowerCase();
    const lineLimit = args.lines;

    // Parse query to determine which services to retrieve
    const services = parseQuery(query);

    if (services.length === 0) {
      return JSON.stringify(
        {
          error: 'Invalid query',
          message: `Could not parse query: "${args.query}"`,
          hint: 'Use queries like: all, server, admin, database, or combinations like "admin and server"',
        },
        null,
        2
      );
    }

    // Collect logs from all requested services
    const logResults: LogResult[] = [];

    for (const service of services) {
      const logs = await readServiceLogs(service, lineLimit);
      logResults.push(...logs);
    }

    // Format output
    return formatLogOutput(logResults, args.query, lineLimit);
  },
});

// Types
interface ServiceConfig {
  id: string;
  type: 'application' | 'dependency';
  displayName: string;
}

interface LogResult {
  service: ServiceConfig;
  logType: 'stdout' | 'stderr';
  fileName: string;
  lines: string[];
  error?: string;
}

/**
 * Parse natural language query to determine which services to retrieve logs from.
 * Supports case-insensitive matching and multiple patterns.
 */
function parseQuery(query: string): ServiceConfig[] {
  const services: ServiceConfig[] = [];
  const uniqueIds = new Set<string>();

  // Service mappings
  const serviceMap: Record<string, ServiceConfig> = {
    admin: {
      id: 'admin',
      type: 'application',
      displayName: 'Admin Frontend',
    },
    web: { id: 'admin', type: 'application', displayName: 'Admin Frontend' },
    server: { id: 'server', type: 'application', displayName: 'Server API' },
    api: { id: 'server', type: 'application', displayName: 'Server API' },
    database: {
      id: 'postgres',
      type: 'dependency',
      displayName: 'PostgreSQL',
    },
    postgres: {
      id: 'postgres',
      type: 'dependency',
      displayName: 'PostgreSQL',
    },
    db: { id: 'postgres', type: 'dependency', displayName: 'PostgreSQL' },
    zitadel: { id: 'zitadel', type: 'dependency', displayName: 'Zitadel' },
  };

  // Check for "all" pattern
  if (query.includes('all')) {
    return [
      serviceMap.admin,
      serviceMap.server,
      serviceMap.postgres,
      serviceMap.zitadel,
    ];
  }

  // Split by "and" or comma to support multiple services
  const patterns = query.split(/\s+and\s+|,\s*/);

  for (const pattern of patterns) {
    const trimmed = pattern.trim();
    const service = serviceMap[trimmed];

    if (service && !uniqueIds.has(service.id)) {
      services.push(service);
      uniqueIds.add(service.id);
    }
  }

  return services;
}

/**
 * Read log files for a specific service (both stdout and stderr).
 */
async function readServiceLogs(
  service: ServiceConfig,
  lineLimit: number
): Promise<LogResult[]> {
  const results: LogResult[] = [];

  // Determine log directory based on service type
  const logDir =
    service.type === 'application'
      ? path.join('apps', 'logs', service.id)
      : path.join('apps', 'logs', 'dependencies', service.id);

  // Read both stdout and stderr logs
  const logFiles = [
    { fileName: 'out.log', logType: 'stdout' as const },
    { fileName: 'error.log', logType: 'stderr' as const },
  ];

  for (const { fileName, logType } of logFiles) {
    const logPath = path.join(logDir, fileName);

    try {
      if (!fs.existsSync(logPath)) {
        results.push({
          service,
          logType,
          fileName: logPath,
          lines: [],
          error: 'Log file not found',
        });
        continue;
      }

      const lines = await readLastNLines(logPath, lineLimit);
      results.push({
        service,
        logType,
        fileName: logPath,
        lines,
      });
    } catch (error) {
      results.push({
        service,
        logType,
        fileName: logPath,
        lines: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

/**
 * Read the last N lines from a file efficiently without loading entire file.
 */
async function readLastNLines(filePath: string, n: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const stat = fs.statSync(filePath);

    if (stat.size === 0) {
      resolve([]);
      return;
    }

    // Read from the end of the file
    const bufferSize = Math.min(stat.size, 64 * 1024); // Read up to 64KB from end
    const buffer = Buffer.alloc(bufferSize);

    fs.open(filePath, 'r', (err, fd) => {
      if (err) {
        reject(err);
        return;
      }

      const startPosition = Math.max(0, stat.size - bufferSize);

      fs.read(fd, buffer, 0, bufferSize, startPosition, (err, bytesRead) => {
        fs.close(fd, () => {
          if (err) {
            reject(err);
            return;
          }

          const content = buffer.toString('utf8', 0, bytesRead);
          const lines = content.split('\n');

          // If we didn't read from the beginning, the first line might be partial
          if (startPosition > 0 && lines.length > 0) {
            lines.shift();
          }

          // Get the last N lines
          const lastLines = lines.slice(-n);
          resolve(lastLines);
        });
      });
    });
  });
}

/**
 * Format log results into readable output.
 */
function formatLogOutput(
  results: LogResult[],
  originalQuery: string,
  lineLimit: number
): string {
  let output = `# Log Results for Query: "${originalQuery}"\n`;
  output += `Showing last ${lineLimit} lines per log file\n\n`;

  for (const result of results) {
    const header = `=== ${result.service.displayName} (${
      result.service.type
    }) - ${result.logType === 'stdout' ? 'Output' : 'Errors'} ===`;
    output += `${header}\n`;
    output += `File: ${result.fileName}\n`;

    if (result.error) {
      output += `Status: ${result.error}\n`;
    } else if (result.lines.length === 0) {
      output += `Status: (no log entries)\n`;
    } else {
      output += `Lines: ${result.lines.length}\n`;
      output += '---\n';
      output += result.lines.join('\n');
      output += '\n';
    }

    output += '\n';
  }

  return output;
}

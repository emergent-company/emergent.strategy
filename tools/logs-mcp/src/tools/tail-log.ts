/**
 * Tail Log Tool
 */

import { tailFile } from '../log-reader.js';

export const tailLogSchema = {
  type: 'object' as const,
  properties: {
    file: {
      type: 'string',
      description:
        'The log file path relative to logs directory (e.g., "server.out.log")',
    },
    lines: {
      type: 'number',
      description: 'Number of lines to retrieve (default: 100)',
    },
  },
  required: ['file'],
};

export interface TailLogInput {
  file: string;
  lines?: number;
}

export async function tailLogTool(input: TailLogInput): Promise<string> {
  const { file, lines = 100 } = input;

  const logLines = await tailFile(file, lines);

  if (logLines.length === 0) {
    return `(no log entries in ${file})`;
  }

  const header = `=== ${file} (last ${logLines.length} lines) ===`;
  return [header, '', ...logLines].join('\n');
}

/**
 * Tail multiple log files and combine output
 */
export async function tailMultipleFiles(
  files: string[],
  lines = 100
): Promise<string> {
  const results: string[] = [];

  for (const file of files) {
    try {
      const logLines = await tailFile(file, lines);
      if (logLines.length > 0) {
        results.push(`=== ${file} (last ${logLines.length} lines) ===`);
        results.push('');
        results.push(...logLines);
        results.push('');
      }
    } catch (error) {
      results.push(`=== ${file} ===`);
      results.push(`(file not found or not readable)`);
      results.push('');
    }
  }

  if (results.length === 0) {
    return '(no log entries found)';
  }

  return results.join('\n');
}

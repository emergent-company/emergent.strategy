/**
 * Get Errors Tool
 */

import { getErrorLines } from '../log-reader.js';

export const getErrorsSchema = {
  type: 'object' as const,
  properties: {
    lines: {
      type: 'number',
      description:
        'Maximum number of error lines to retrieve per file (default: 50)',
    },
    files: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Specific files to check (optional, checks error logs if not specified)',
    },
  },
};

export interface GetErrorsInput {
  lines?: number;
  files?: string[];
}

export async function getErrorsTool(input: GetErrorsInput): Promise<string> {
  const { lines = 50, files } = input;

  const results = await getErrorLines({ files, lines });

  if (results.size === 0) {
    return 'No errors found in log files.';
  }

  const output: string[] = ['Recent errors:'];
  let totalErrors = 0;

  for (const [file, errorLines] of results) {
    output.push('');
    output.push(`=== ${file} (${errorLines.length} errors) ===`);
    output.push(...errorLines);
    totalErrors += errorLines.length;
  }

  output.push('');
  output.push(`Total: ${totalErrors} error lines in ${results.size} files`);

  return output.join('\n');
}

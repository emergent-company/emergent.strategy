/**
 * Search Logs Tool
 */

import { searchLogs } from '../log-reader.js';

export const searchLogsSchema = {
  type: 'object' as const,
  properties: {
    pattern: {
      type: 'string',
      description: 'The text pattern to search for',
    },
    files: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Specific files to search (optional, searches all if not specified)',
    },
    caseSensitive: {
      type: 'boolean',
      description: 'Whether search should be case-sensitive (default: false)',
    },
  },
  required: ['pattern'],
};

export interface SearchLogsInput {
  pattern: string;
  files?: string[];
  caseSensitive?: boolean;
}

export async function searchLogsTool(input: SearchLogsInput): Promise<string> {
  const { pattern, files, caseSensitive = false } = input;

  const results = await searchLogs(pattern, {
    files,
    caseSensitive,
    maxMatchesPerFile: 50,
  });

  if (results.size === 0) {
    return `No matches found for "${pattern}"`;
  }

  const lines: string[] = [`Search results for "${pattern}":`];
  let totalMatches = 0;

  for (const [file, matches] of results) {
    lines.push('');
    lines.push(`=== ${file} (${matches.length} matches) ===`);

    for (const match of matches) {
      lines.push(`  ${match.line}: ${match.content}`);
      totalMatches++;
    }
  }

  lines.push('');
  lines.push(`Total: ${totalMatches} matches in ${results.size} files`);

  return lines.join('\n');
}

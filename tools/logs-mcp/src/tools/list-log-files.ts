/**
 * List Log Files Tool
 */

import { listLogFiles } from '../log-reader.js';

export const listLogFilesSchema = {
  type: 'object' as const,
  properties: {
    includeSize: {
      type: 'boolean',
      description: 'Include file sizes in the output (default: true)',
    },
  },
};

export interface ListLogFilesInput {
  includeSize?: boolean;
}

export async function listLogFilesTool(
  input: ListLogFilesInput
): Promise<string> {
  const includeSize = input.includeSize !== false;
  const files = await listLogFiles();

  if (files.length === 0) {
    return 'No log files found in the logs directory.';
  }

  const lines: string[] = ['Available log files:', ''];

  for (const file of files) {
    if (includeSize) {
      const modified = file.modifiedAt
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');
      lines.push(
        `  ${file.path.padEnd(30)} ${file.sizeHuman.padStart(10)}  ${modified}`
      );
    } else {
      lines.push(`  ${file.path}`);
    }
  }

  lines.push('');
  lines.push(`Total: ${files.length} files`);

  return lines.join('\n');
}

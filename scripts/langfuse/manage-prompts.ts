#!/usr/bin/env npx tsx
/**
 * Langfuse Prompt Management Script
 *
 * Manages prompts in Langfuse for the extraction pipeline.
 *
 * Usage:
 *   npx tsx scripts/langfuse/manage-prompts.ts list
 *   npx tsx scripts/langfuse/manage-prompts.ts get <prompt-name>
 *   npx tsx scripts/langfuse/manage-prompts.ts create <prompt-name> --file <path>
 *   npx tsx scripts/langfuse/manage-prompts.ts update <prompt-name> --file <path>
 *   npx tsx scripts/langfuse/manage-prompts.ts update <prompt-name> --content "prompt text"
 *
 * Environment variables (from .env):
 *   LANGFUSE_HOST - Langfuse API host (e.g., http://localhost:3011)
 *   LANGFUSE_PUBLIC_KEY - Public key for authentication
 *   LANGFUSE_SECRET_KEY - Secret key for authentication
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

// Load environment variables
config({ path: path.resolve(process.cwd(), '.env') });

const LANGFUSE_HOST = process.env.LANGFUSE_HOST || 'http://localhost:3011';
const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY;
const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY;

if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) {
  console.error(
    'Error: LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be set'
  );
  process.exit(1);
}

// Basic auth header
const authHeader = `Basic ${Buffer.from(
  `${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`
).toString('base64')}`;

interface LangfusePrompt {
  id: string;
  name: string;
  version: number;
  prompt: string;
  type: 'text' | 'chat';
  labels: string[];
  tags: string[];
  config: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface ListPromptsResponse {
  data: LangfusePrompt[];
  meta: {
    totalItems: number;
    page: number;
    limit: number;
  };
}

/**
 * List all prompts
 */
async function listPrompts(): Promise<void> {
  console.log(`\nFetching prompts from ${LANGFUSE_HOST}...\n`);

  const response = await fetch(`${LANGFUSE_HOST}/api/public/v2/prompts`, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to list prompts: ${response.status} ${error}`);
  }

  const data = (await response.json()) as ListPromptsResponse;

  if (!data.data || data.data.length === 0) {
    console.log('No prompts found.');
    return;
  }

  console.log('Available prompts:');
  console.log('─'.repeat(80));

  // Group by name to show versions
  const byName = new Map<string, LangfusePrompt[]>();
  for (const prompt of data.data) {
    const list = byName.get(prompt.name) || [];
    list.push(prompt);
    byName.set(prompt.name, list);
  }

  for (const [name, versions] of byName) {
    const latest = versions.reduce((a, b) => (a.version > b.version ? a : b));
    const labels =
      latest.labels.length > 0 ? ` [${latest.labels.join(', ')}]` : '';
    console.log(`\n📝 ${name}${labels}`);
    console.log(`   Type: ${latest.type}`);
    console.log(`   Latest version: v${latest.version}`);
    console.log(
      `   Versions: ${versions.map((v) => `v${v.version}`).join(', ')}`
    );
    console.log(`   Updated: ${new Date(latest.updatedAt).toLocaleString()}`);
    console.log(`   Preview: ${latest.prompt.substring(0, 100)}...`);
  }

  console.log('\n' + '─'.repeat(80));
  console.log(
    `Total: ${byName.size} prompt(s), ${data.data.length} version(s)`
  );
}

/**
 * Get a specific prompt by name
 */
async function getPrompt(name: string, version?: number): Promise<void> {
  console.log(
    `\nFetching prompt "${name}"${version ? ` v${version}` : ' (latest)'}...\n`
  );

  const url = version
    ? `${LANGFUSE_HOST}/api/public/v2/prompts/${encodeURIComponent(
        name
      )}?version=${version}`
    : `${LANGFUSE_HOST}/api/public/v2/prompts/${encodeURIComponent(name)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get prompt: ${response.status} ${error}`);
  }

  const prompt = (await response.json()) as LangfusePrompt;

  console.log('─'.repeat(80));
  console.log(`Name: ${prompt.name}`);
  console.log(`Version: ${prompt.version}`);
  console.log(`Type: ${prompt.type}`);
  console.log(`Labels: ${prompt.labels.join(', ') || '(none)'}`);
  console.log(`Tags: ${prompt.tags.join(', ') || '(none)'}`);
  console.log(`Created: ${new Date(prompt.createdAt).toLocaleString()}`);
  console.log(`Updated: ${new Date(prompt.updatedAt).toLocaleString()}`);
  console.log('─'.repeat(80));
  console.log('\nPrompt content:\n');
  console.log(prompt.prompt);
  console.log('\n' + '─'.repeat(80));
}

/**
 * Create or update a prompt
 */
async function createOrUpdatePrompt(
  name: string,
  content: string,
  options: {
    labels?: string[];
    tags?: string[];
    config?: Record<string, any>;
  } = {}
): Promise<void> {
  console.log(`\nCreating/updating prompt "${name}"...`);
  console.log(`Content length: ${content.length} characters`);

  const body = {
    name,
    prompt: content,
    type: 'text',
    labels: options.labels || [],
    tags: options.tags || [],
    config: options.config || {},
  };

  const response = await fetch(`${LANGFUSE_HOST}/api/public/v2/prompts`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Failed to create/update prompt: ${response.status} ${error}`
    );
  }

  const result = (await response.json()) as LangfusePrompt;

  console.log('\n✅ Prompt saved successfully!');
  console.log(`   Name: ${result.name}`);
  console.log(`   Version: ${result.version}`);
  console.log(`   ID: ${result.id}`);
}

/**
 * Set labels on a prompt version
 */
async function setLabels(
  name: string,
  version: number,
  labels: string[]
): Promise<void> {
  console.log(
    `\nSetting labels [${labels.join(', ')}] on "${name}" v${version}...`
  );

  // First get the prompt to get its ID
  const getResponse = await fetch(
    `${LANGFUSE_HOST}/api/public/v2/prompts/${encodeURIComponent(
      name
    )}?version=${version}`,
    {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!getResponse.ok) {
    const error = await getResponse.text();
    throw new Error(`Failed to get prompt: ${getResponse.status} ${error}`);
  }

  // Use the PATCH endpoint to update labels
  const patchResponse = await fetch(
    `${LANGFUSE_HOST}/api/public/v2/prompts/${encodeURIComponent(
      name
    )}/versions/${version}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ labels }),
    }
  );

  if (!patchResponse.ok) {
    const error = await patchResponse.text();
    throw new Error(`Failed to set labels: ${patchResponse.status} ${error}`);
  }

  console.log('✅ Labels updated successfully!');
}

/**
 * Export prompt to a file
 */
async function exportPrompt(
  name: string,
  outputPath: string,
  version?: number
): Promise<void> {
  console.log(`\nExporting prompt "${name}" to ${outputPath}...`);

  const url = version
    ? `${LANGFUSE_HOST}/api/public/v2/prompts/${encodeURIComponent(
        name
      )}?version=${version}`
    : `${LANGFUSE_HOST}/api/public/v2/prompts/${encodeURIComponent(name)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get prompt: ${response.status} ${error}`);
  }

  const prompt = (await response.json()) as LangfusePrompt;

  // Export as JSON with metadata
  const exportData = {
    name: prompt.name,
    version: prompt.version,
    type: prompt.type,
    labels: prompt.labels,
    tags: prompt.tags,
    config: prompt.config,
    prompt: prompt.prompt,
    exportedAt: new Date().toISOString(),
  };

  fs.writeFileSync(outputPath, JSON.stringify(exportData, null, 2));
  console.log(`✅ Exported to ${outputPath}`);
}

/**
 * Import prompt from a file
 */
async function importPrompt(
  inputPath: string,
  options: { name?: string } = {}
): Promise<void> {
  console.log(`\nImporting prompt from ${inputPath}...`);

  const content = fs.readFileSync(inputPath, 'utf-8');

  // Check if it's a JSON export or raw text
  let promptContent: string;
  let promptName: string;
  let labels: string[] = [];
  let tags: string[] = [];
  let config: Record<string, any> = {};

  try {
    const data = JSON.parse(content);
    if (data.prompt) {
      // It's a JSON export
      promptContent = data.prompt;
      promptName = options.name || data.name;
      labels = data.labels || [];
      tags = data.tags || [];
      config = data.config || {};
    } else {
      // It's raw text in JSON format
      promptContent = content;
      promptName = options.name!;
    }
  } catch {
    // It's raw text
    promptContent = content;
    promptName = options.name!;
  }

  if (!promptName) {
    throw new Error(
      'Prompt name is required. Use --name option or provide a JSON export with name field.'
    );
  }

  await createOrUpdatePrompt(promptName, promptContent, {
    labels,
    tags,
    config,
  });
}

// ============================================================================
// CLI
// ============================================================================

function printUsage(): void {
  console.log(`
Langfuse Prompt Management Script

Usage:
  npx tsx scripts/langfuse/manage-prompts.ts <command> [options]

Commands:
  list                              List all prompts
  get <name> [--version <n>]        Get a specific prompt
  create <name> --file <path>       Create a new prompt from file
  create <name> --content "text"    Create a new prompt from text
  update <name> --file <path>       Update prompt from file (creates new version)
  update <name> --content "text"    Update prompt from text
  export <name> --output <path>     Export prompt to JSON file
  import --file <path> [--name <n>] Import prompt from file
  labels <name> <version> <labels>  Set labels on a prompt version

Options:
  --version <n>    Specific version number
  --file <path>    Path to prompt file
  --content "text" Prompt content as string
  --output <path>  Output file path
  --name <name>    Prompt name (for import)
  --labels <l1,l2> Comma-separated labels

Examples:
  npx tsx scripts/langfuse/manage-prompts.ts list
  npx tsx scripts/langfuse/manage-prompts.ts get entity-extractor
  npx tsx scripts/langfuse/manage-prompts.ts get entity-extractor --version 1
  npx tsx scripts/langfuse/manage-prompts.ts update entity-extractor --file prompts/entity-extractor.txt
  npx tsx scripts/langfuse/manage-prompts.ts export entity-extractor --output backup.json
  npx tsx scripts/langfuse/manage-prompts.ts labels entity-extractor 2 production
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(0);
  }

  const command = args[0];

  try {
    switch (command) {
      case 'list': {
        await listPrompts();
        break;
      }

      case 'get': {
        const name = args[1];
        if (!name) {
          console.error('Error: Prompt name is required');
          process.exit(1);
        }
        const versionIdx = args.indexOf('--version');
        const version =
          versionIdx !== -1 ? parseInt(args[versionIdx + 1], 10) : undefined;
        await getPrompt(name, version);
        break;
      }

      case 'create':
      case 'update': {
        const name = args[1];
        if (!name) {
          console.error('Error: Prompt name is required');
          process.exit(1);
        }

        const fileIdx = args.indexOf('--file');
        const contentIdx = args.indexOf('--content');

        let content: string;
        if (fileIdx !== -1) {
          const filePath = args[fileIdx + 1];
          content = fs.readFileSync(filePath, 'utf-8');
        } else if (contentIdx !== -1) {
          content = args[contentIdx + 1];
        } else {
          console.error('Error: --file or --content is required');
          process.exit(1);
        }

        const labelsIdx = args.indexOf('--labels');
        const labels = labelsIdx !== -1 ? args[labelsIdx + 1].split(',') : [];

        await createOrUpdatePrompt(name, content, { labels });
        break;
      }

      case 'export': {
        const name = args[1];
        if (!name) {
          console.error('Error: Prompt name is required');
          process.exit(1);
        }
        const outputIdx = args.indexOf('--output');
        if (outputIdx === -1) {
          console.error('Error: --output is required');
          process.exit(1);
        }
        const outputPath = args[outputIdx + 1];
        const versionIdx = args.indexOf('--version');
        const version =
          versionIdx !== -1 ? parseInt(args[versionIdx + 1], 10) : undefined;
        await exportPrompt(name, outputPath, version);
        break;
      }

      case 'import': {
        const fileIdx = args.indexOf('--file');
        if (fileIdx === -1) {
          console.error('Error: --file is required');
          process.exit(1);
        }
        const filePath = args[fileIdx + 1];
        const nameIdx = args.indexOf('--name');
        const name = nameIdx !== -1 ? args[nameIdx + 1] : undefined;
        await importPrompt(filePath, { name });
        break;
      }

      case 'labels': {
        const name = args[1];
        const version = parseInt(args[2], 10);
        const labels = args.slice(3);
        if (!name || isNaN(version) || labels.length === 0) {
          console.error(
            'Error: Usage: labels <name> <version> <label1> [label2] ...'
          );
          process.exit(1);
        }
        await setLabels(name, version, labels);
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (error) {
    console.error(
      '\n❌ Error:',
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}

main();

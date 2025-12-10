#!/usr/bin/env npx tsx
/**
 * Test Context-Aware Extraction
 *
 * This script tests the context-aware entity extraction feature by:
 * 1. Loading existing entities from the knowledge graph
 * 2. Running extraction WITH context (existing entities provided)
 * 3. Running extraction WITHOUT context (baseline)
 * 4. Comparing the results to see if context improves accuracy
 *
 * Usage:
 *   npx tsx scripts/extraction_tests/test-context-aware-extraction.ts --project <project-id>
 *
 * Options:
 *   --project <id>     Project ID to use for entity context (required)
 *   --document <path>  Path to document file to extract from (optional, uses sample if not provided)
 *   --verbose          Show detailed output
 *   --dry-run          Just show what would be done without making LLM calls
 */

import { config } from 'dotenv';
import { parseArgs } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import { Pool } from 'pg';

// Load environment variables from multiple files
config({ path: '.env' });
config({ path: '.env.remote' });
config({ path: '.env.local' });

interface CliArgs {
  project?: string;
  document?: string;
  verbose: boolean;
  dryRun: boolean;
  help: boolean;
}

interface ExistingEntity {
  id: string;
  name: string;
  type_name: string;
  description?: string;
  similarity?: number;
}

function printUsage(): void {
  console.log(`
Test Context-Aware Entity Extraction

Usage:
  npx tsx scripts/extraction_tests/test-context-aware-extraction.ts [options]

Options:
  --project <id>      Project ID to load existing entities from (required)
  --document <path>   Path to document file to extract from (optional)
  --verbose           Show detailed output including prompts
  --dry-run           Show context without making LLM calls
  --help              Show this help message

Examples:
  # Test with a specific project
  npx tsx scripts/extraction_tests/test-context-aware-extraction.ts \\
    --project abc-123-uuid

  # Test with custom document
  npx tsx scripts/extraction_tests/test-context-aware-extraction.ts \\
    --project abc-123-uuid \\
    --document ./my-document.txt

  # Dry run to see what entities would be loaded
  npx tsx scripts/extraction_tests/test-context-aware-extraction.ts \\
    --project abc-123-uuid \\
    --dry-run
`);
}

function parseCliArgs(): CliArgs {
  const { values } = parseArgs({
    options: {
      project: { type: 'string', short: 'p' },
      document: { type: 'string', short: 'd' },
      verbose: { type: 'boolean', short: 'v', default: false },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  return {
    project: values.project as string | undefined,
    document: values.document as string | undefined,
    verbose: values.verbose as boolean,
    dryRun: values['dry-run'] as boolean,
    help: values.help as boolean,
  };
}

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Sample document for testing (from 1 John)
const SAMPLE_DOCUMENT = `# First Epistle of John - Chapter 1

1. That which was from the beginning, which we have heard, which we have seen with our eyes, which we looked upon and have touched with our hands, concerning the word of life—
2. the life was made manifest, and we have seen it, and testify to it and proclaim to you the eternal life, which was with the Father and was made manifest to us—
3. that which we have seen and heard we proclaim also to you, so that you too may have fellowship with us; and indeed our fellowship is with the Father and with his Son Jesus Christ.
4. And we are writing these things so that our joy may be complete.
5. This is the message we have heard from him and proclaim to you, that God is light, and in him is no darkness at all.
6. If we say we have fellowship with him while we walk in darkness, we lie and do not practice the truth.
7. But if we walk in the light, as he is in the light, we have fellowship with one another, and the blood of Jesus his Son cleanses us from all sin.
8. If we say we have no sin, we deceive ourselves, and the truth is not in us.
9. If we confess our sins, he is faithful and just to forgive us our sins and to cleanse us from all unrighteousness.
10. If we say we have not sinned, we make him a liar, and his word is not in us.

# First Epistle of John - Chapter 2

1. My little children, I am writing these things to you so that you may not sin. But if anyone does sin, we have an advocate with the Father, Jesus Christ the righteous.
2. He is the propitiation for our sins, and not for ours only but also for the sins of the whole world.
3. And by this we know that we have come to know him, if we keep his commandments.
4. Whoever says "I know him" but does not keep his commandments is a liar, and the truth is not in him,
5. but whoever keeps his word, in him truly the love of God is perfected. By this we may know that we are in him:
6. whoever says he abides in him ought to walk in the same way in which he walked.
7. Beloved, I am writing you no new commandment, but an old commandment that you had from the beginning. The old commandment is the word that you have heard.
8. At the same time, it is a new commandment that I am writing to you, which is true in him and in you, because the darkness is passing away and the true light is already shining.
9. Whoever says he is in the light and hates his brother is still in darkness.
10. Whoever loves his brother abides in the light, and in him there is no cause for stumbling.`;

async function loadExistingEntities(
  pool: Pool,
  projectId: string,
  verbose: boolean
): Promise<ExistingEntity[]> {
  log('Loading existing entities from knowledge graph...');

  // Query for existing entities with embeddings
  const result = await pool.query<{
    id: string;
    canonical_id: string;
    type: string;
    key: string;
    properties: Record<string, any>;
  }>(
    `SELECT id, canonical_id, type, key, properties
     FROM kb.graph_objects
     WHERE project_id = $1
       AND deleted_at IS NULL
       AND supersedes_id IS NULL
     ORDER BY type, created_at DESC
     LIMIT 100`,
    [projectId]
  );

  const entities: ExistingEntity[] = result.rows.map((row) => ({
    id: row.canonical_id || row.id,
    name: row.properties?.name || row.key,
    type_name: row.type,
    description: row.properties?.description?.substring(0, 200),
  }));

  log(`Loaded ${entities.length} existing entities`);

  // Group by type for summary
  const byType = new Map<string, number>();
  for (const entity of entities) {
    byType.set(entity.type_name, (byType.get(entity.type_name) || 0) + 1);
  }

  log('Entity type breakdown:');
  for (const [type, count] of byType) {
    log(`  - ${type}: ${count}`);
  }

  if (verbose) {
    log('\nFirst 10 entities:');
    for (const entity of entities.slice(0, 10)) {
      log(`  - [${entity.type_name}] ${entity.name}`);
    }
  }

  return entities;
}

function formatExistingEntitiesForPrompt(
  entities: ExistingEntity[],
  maxPerType: number = 10,
  maxTotal: number = 50
): string {
  // Group by type
  const byType = new Map<string, ExistingEntity[]>();
  for (const entity of entities) {
    const list = byType.get(entity.type_name) || [];
    list.push(entity);
    byType.set(entity.type_name, list);
  }

  let result = '';
  let totalShown = 0;

  for (const [typeName, typeEntities] of byType) {
    if (totalShown >= maxTotal) break;

    result += `### ${typeName}\n`;
    const toShow = typeEntities.slice(0, maxPerType);

    for (const entity of toShow) {
      if (totalShown >= maxTotal) break;
      const desc = entity.description
        ? ` - ${entity.description.slice(0, 100)}`
        : '';
      result += `- **${entity.name}** [id: ${entity.id}]${desc}\n`;
      totalShown++;
    }

    if (typeEntities.length > maxPerType) {
      result += `  _(and ${typeEntities.length - maxPerType} more)_\n`;
    }
    result += '\n';
  }

  return result;
}

function buildPromptWithContext(
  documentText: string,
  existingEntities: ExistingEntity[]
): string {
  const contextSection =
    existingEntities.length > 0
      ? `
## Context-Aware Extraction Rules

Below is a list of existing entities already in the knowledge graph.
When you find an entity that MATCHES an existing one:
- Use the SAME NAME and set action="enrich"
- Include "existing_entity_id" with the UUID from the existing entity

For each entity, specify an "action":
- "create" (default): This is a completely NEW entity
- "enrich": This entity MATCHES an existing entity - new info should be merged
- "reference": This entity is just a reference (for relationships only)

## Existing Entities in Knowledge Graph

${formatExistingEntitiesForPrompt(existingEntities)}
`
      : '';

  return `You are an expert knowledge graph builder. Extract entities from the document.

For EACH entity, provide:
1. name: Clear, descriptive name of the entity
2. type: Entity type from the allowed list
3. description: Brief description of what this entity represents
${
  existingEntities.length > 0
    ? '4. action: "create", "enrich", or "reference"\n5. existing_entity_id: UUID if action is "enrich" or "reference"'
    : ''
}

RULES:
- Extract ALL entities that match the allowed types
- Be thorough - don't miss important entities
- Use consistent naming
- Keep descriptions concise but informative

## Allowed Entity Types

Extract ONLY these types: Person, Place, Event, Book, Quote, Group, Concept, Covenant

- **Person**: A human individual (biblical or otherwise)
- **Place**: A location or geographic entity
- **Event**: A notable occurrence or happening
- **Book**: A written work or scripture
- **Quote**: A significant statement or teaching
- **Group**: A collection of people
- **Concept**: An abstract idea or theological principle
- **Covenant**: A divine agreement or promise
${contextSection}
## Document

${documentText}

## Output Format

Return a JSON object with an "entities" array. Each entity must have:
- name (string): Entity name
- type (string): One of the allowed types above
- description (string, optional): Brief description
${
  existingEntities.length > 0
    ? `- action (string, optional): "create", "enrich", or "reference"
- existing_entity_id (string, optional): UUID when action is "enrich" or "reference"`
    : ''
}

Example:
\`\`\`json
{
  "entities": [
    {"name": "John", "type": "Person", "description": "Author of the epistle"${
      existingEntities.length > 0 ? ', "action": "create"' : ''
    }},
    {"name": "Jesus Christ", "type": "Person", "description": "Son of God mentioned as advocate"${
      existingEntities.length > 0
        ? ', "action": "enrich", "existing_entity_id": "uuid-here"'
        : ''
    }}
  ]
}
\`\`\`

Extract all entities now.`;
}

async function main(): Promise<void> {
  const args = parseCliArgs();

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  if (!args.project) {
    console.error('Error: --project is required');
    printUsage();
    process.exit(1);
  }

  log('='.repeat(70));
  log('Context-Aware Extraction Test');
  log('='.repeat(70));
  log(`Project ID: ${args.project}`);
  log(`Document: ${args.document || '(using sample)'}`);
  log(`Verbose: ${args.verbose}`);
  log(`Dry Run: ${args.dryRun}`);
  log('='.repeat(70));

  // Connect to database
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Load document
    let documentText: string;
    if (args.document) {
      const docPath = path.resolve(args.document);
      if (!fs.existsSync(docPath)) {
        console.error(`Error: Document not found: ${docPath}`);
        process.exit(1);
      }
      documentText = fs.readFileSync(docPath, 'utf-8');
      log(`Loaded document from ${docPath} (${documentText.length} chars)`);
    } else {
      documentText = SAMPLE_DOCUMENT;
      log(`Using sample document (${documentText.length} chars)`);
    }

    // Load existing entities
    const existingEntities = await loadExistingEntities(
      pool,
      args.project,
      args.verbose
    );

    if (existingEntities.length === 0) {
      log('\nWARNING: No existing entities found in project.');
      log('Context-aware extraction works best with existing entities.');
      log(
        'Consider running extraction on some documents first, or use a different project.'
      );
    }

    log('\n' + '='.repeat(70));
    log('PROMPT COMPARISON');
    log('='.repeat(70));

    // Build prompts
    const promptWithContext = buildPromptWithContext(
      documentText,
      existingEntities
    );
    const promptWithoutContext = buildPromptWithContext(documentText, []);

    log(`\nPrompt WITHOUT context: ${promptWithoutContext.length} chars`);
    log(`Prompt WITH context: ${promptWithContext.length} chars`);
    log(
      `Context adds: ${
        promptWithContext.length - promptWithoutContext.length
      } chars`
    );

    if (args.verbose) {
      log('\n' + '-'.repeat(70));
      log('PROMPT WITH CONTEXT (first 2000 chars):');
      log('-'.repeat(70));
      log(promptWithContext.substring(0, 2000) + '...');
    }

    if (args.dryRun) {
      log('\n' + '='.repeat(70));
      log('DRY RUN COMPLETE');
      log('='.repeat(70));
      log('To run actual extraction, remove the --dry-run flag.');
      log(
        'This will make LLM API calls to compare extraction with/without context.'
      );
      await pool.end();
      process.exit(0);
    }

    // TODO: Add actual LLM extraction calls here
    // For now, we just show the prompt comparison
    log('\n' + '='.repeat(70));
    log('EXTRACTION (Not Implemented Yet)');
    log('='.repeat(70));
    log('Actual LLM extraction requires NativeGeminiService.');
    log('To test extraction, use the server API or integration tests.');
    log('');
    log('What this script demonstrates:');
    log('1. How existing entities are loaded from the database');
    log('2. How they are formatted for the extraction prompt');
    log('3. The difference in prompt size with/without context');
    log('');
    log('Next steps to complete this test:');
    log('- Add NativeGeminiService initialization');
    log('- Run extraction twice (with and without context)');
    log('- Compare extracted entities for:');
    log('  - Entity naming consistency');
    log('  - Action field usage (create vs enrich vs reference)');
    log('  - existing_entity_id accuracy');

    await pool.end();
    log('\n' + '='.repeat(70));
    log('TEST COMPLETE');
    log('='.repeat(70));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${errorMessage}`);
    await pool.end();
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

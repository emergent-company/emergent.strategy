#!/usr/bin/env tsx
/**
 * Database Schema Validation Script
 * ==================================
 * Validates that the database schema matches expected migrations
 *
 * Usage:
 *   npm run db:validate           # Validate only
 *   npm run db:validate --fix     # Validate and auto-fix issues
 *   npm run db:validate --verbose # Show detailed information
 *   npm run db:validate --diff    # Show schema differences
 */

import { Client } from 'pg';
import * as dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  validateEnvVars,
  DB_REQUIREMENTS,
  getDbConfig,
} from './lib/env-validator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Load environment
const envPath = path.join(PROJECT_ROOT, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const MIGRATIONS_DIR = path.join(PROJECT_ROOT, 'apps/server/src/migrations');

// ANSI colors
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const NC = '\x1b[0m';

interface TableCheck {
  schema: string;
  table: string;
  minColumns: number;
  critical: boolean;
  description: string;
}

interface FunctionCheck {
  schema: string;
  name: string;
  critical: boolean;
  description: string;
}

interface ValidationResult {
  passed: boolean;
  issues: string[];
  warnings: string[];
  tablesChecked: number;
  tablesMissing: number;
  functionsChecked: number;
  functionsMissing: number;
  migrationIssues: number;
}

// All tables are critical - app should not start without complete schema
const CRITICAL_TABLES: TableCheck[] = [
  {
    schema: 'kb',
    table: 'documents',
    minColumns: 7,
    critical: true,
    description: 'Document storage',
  },
  {
    schema: 'kb',
    table: 'chunks',
    minColumns: 5,
    critical: true,
    description: 'Text chunks with embeddings',
  },
  {
    schema: 'kb',
    table: 'object_extraction_jobs',
    minColumns: 30,
    critical: true,
    description: 'Extraction job queue',
  },
  {
    schema: 'kb',
    table: 'graph_embedding_jobs',
    minColumns: 10,
    critical: true,
    description: 'Embedding job queue',
  },
  {
    schema: 'kb',
    table: 'auth_introspection_cache',
    minColumns: 3,
    critical: true,
    description: 'OAuth token cache',
  },
  {
    schema: 'kb',
    table: 'tags',
    minColumns: 3,
    critical: true,
    description: 'Tag management',
  },
  {
    schema: 'kb',
    table: 'graph_objects',
    minColumns: 5,
    critical: true,
    description: 'Extracted graph objects',
  },
  {
    schema: 'kb',
    table: 'graph_relationships',
    minColumns: 4,
    critical: true,
    description: 'Object relationships',
  },
];

// No optional tables - all tables are required for proper operation
const OPTIONAL_TABLES: TableCheck[] = [];

// All functions are critical - app should not start without complete schema
const REQUIRED_FUNCTIONS: FunctionCheck[] = [
  {
    schema: 'kb',
    name: 'update_tsv',
    critical: true,
    description: 'Full-text search trigger',
  },
  {
    schema: 'kb',
    name: 'refresh_revision_counts',
    critical: true,
    description: 'Refresh materialized view',
  },
];

// No optional functions - all functions are required
const OPTIONAL_FUNCTIONS: FunctionCheck[] = [];

async function getClient(): Promise<Client> {
  validateEnvVars(DB_REQUIREMENTS);
  const dbConfig = getDbConfig();
  const client = new Client(dbConfig);
  await client.connect();
  return client;
}

async function checkTableExists(
  client: Client,
  schema: string,
  table: string
): Promise<{ exists: boolean; columnCount: number }> {
  const result = await client.query(
    `SELECT COUNT(*) as column_count
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2`,
    [schema, table]
  );

  const columnCount = parseInt(result.rows[0]?.column_count || '0');
  return {
    exists: columnCount > 0,
    columnCount,
  };
}

async function checkFunctionExists(
  client: Client,
  schema: string,
  funcName: string
): Promise<boolean> {
  const result = await client.query(
    `SELECT EXISTS (
            SELECT 1 FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE n.nspname = $1 AND p.proname = $2
        ) as exists`,
    [schema, funcName]
  );

  return result.rows[0]?.exists || false;
}

async function getAppliedMigrations(client: Client): Promise<Set<string>> {
  try {
    // TypeORM uses 'typeorm_migrations' table, not 'schema_migrations'
    const result = await client.query(
      `SELECT name FROM public.typeorm_migrations ORDER BY name`
    );
    // TypeORM stores full migration names (e.g., "1762934197000-SquashedInitialSchema")
    return new Set(result.rows.map((r) => r.name));
  } catch (error) {
    // Table doesn't exist yet
    return new Set();
  }
}

function getAvailableMigrations(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.d.ts') && f !== 'README.md'
    )
    .map((f) => f.replace('.ts', ''))
    .sort();
}

async function validateSchema(
  client: Client,
  verbose: boolean
): Promise<ValidationResult> {
  const result: ValidationResult = {
    passed: true,
    issues: [],
    warnings: [],
    tablesChecked: 0,
    tablesMissing: 0,
    functionsChecked: 0,
    functionsMissing: 0,
    migrationIssues: 0,
  };

  console.log(
    `${BLUE}═══════════════════════════════════════════════════════════════${NC}`
  );
  console.log(`${BLUE}  Database Schema Validation${NC}`);
  console.log(
    `${BLUE}═══════════════════════════════════════════════════════════════${NC}\n`
  );

  // Check 1: Migration tracking
  console.log(`${BLUE}[1/4] Checking migration tracking...${NC}`);
  const applied = await getAppliedMigrations(client);
  const available = getAvailableMigrations();

  if (applied.size === 0) {
    console.log(
      `  ${YELLOW}⚠${NC} No migrations tracked (typeorm_migrations is empty)`
    );
    result.warnings.push('Migration tracking table is empty or missing');
    result.migrationIssues++;
  } else {
    console.log(
      `  ${GREEN}✓${NC} ${applied.size} migrations tracked as applied`
    );
  }

  const pending = available.filter((m) => !applied.has(m));
  if (pending.length > 0) {
    console.log(
      `  ${YELLOW}⚠${NC} ${pending.length} migrations not marked as applied:`
    );
    pending.forEach((m) => console.log(`    - ${m}`));
    result.warnings.push(`${pending.length} migrations not tracked`);
    result.migrationIssues += pending.length;
  }

  console.log();

  // Check 2: Critical tables
  console.log(`${BLUE}[2/4] Checking critical tables...${NC}`);
  for (const tableCheck of CRITICAL_TABLES) {
    result.tablesChecked++;
    const { exists, columnCount } = await checkTableExists(
      client,
      tableCheck.schema,
      tableCheck.table
    );

    if (!exists) {
      console.log(
        `  ${RED}✗${NC} ${tableCheck.schema}.${tableCheck.table} - TABLE MISSING (${tableCheck.description})`
      );
      result.issues.push(
        `Missing critical table: ${tableCheck.schema}.${tableCheck.table}`
      );
      result.tablesMissing++;
      result.passed = false;
    } else if (columnCount < tableCheck.minColumns) {
      console.log(
        `  ${RED}✗${NC} ${tableCheck.schema}.${tableCheck.table} - INCOMPLETE (${columnCount} columns, expected ${tableCheck.minColumns}+)`
      );
      result.issues.push(
        `Table ${tableCheck.schema}.${tableCheck.table} has insufficient columns`
      );
      result.passed = false;
    } else {
      if (verbose) {
        console.log(
          `  ${GREEN}✓${NC} ${tableCheck.schema}.${tableCheck.table} (${columnCount} columns) - ${tableCheck.description}`
        );
      } else {
        console.log(
          `  ${GREEN}✓${NC} ${tableCheck.schema}.${tableCheck.table} (${columnCount} columns)`
        );
      }
    }
  }

  console.log();

  // Check 3: Optional tables
  if (verbose || OPTIONAL_TABLES.length > 0) {
    console.log(`${BLUE}[3/4] Checking optional tables...${NC}`);
    for (const tableCheck of OPTIONAL_TABLES) {
      const { exists, columnCount } = await checkTableExists(
        client,
        tableCheck.schema,
        tableCheck.table
      );

      if (!exists) {
        console.log(
          `  ${YELLOW}⚠${NC} ${tableCheck.schema}.${tableCheck.table} - TABLE MISSING (non-critical)`
        );
        result.warnings.push(
          `Optional table missing: ${tableCheck.schema}.${tableCheck.table}`
        );
      } else {
        console.log(
          `  ${GREEN}✓${NC} ${tableCheck.schema}.${tableCheck.table} (${columnCount} columns)`
        );
      }
    }
    console.log();
  }

  // Check 4: Functions
  console.log(
    `${BLUE}[${verbose ? '4' : '3'}/4] Checking required functions...${NC}`
  );
  for (const funcCheck of REQUIRED_FUNCTIONS) {
    result.functionsChecked++;
    const exists = await checkFunctionExists(
      client,
      funcCheck.schema,
      funcCheck.name
    );

    if (!exists) {
      console.log(
        `  ${RED}✗${NC} ${funcCheck.schema}.${funcCheck.name}() - FUNCTION MISSING`
      );
      result.issues.push(
        `Missing critical function: ${funcCheck.schema}.${funcCheck.name}()`
      );
      result.functionsMissing++;
      result.passed = false;
    } else {
      console.log(
        `  ${GREEN}✓${NC} ${funcCheck.schema}.${funcCheck.name}() - ${funcCheck.description}`
      );
    }
  }

  for (const funcCheck of OPTIONAL_FUNCTIONS) {
    const exists = await checkFunctionExists(
      client,
      funcCheck.schema,
      funcCheck.name
    );
    if (!exists) {
      console.log(
        `  ${YELLOW}⚠${NC} ${funcCheck.schema}.${funcCheck.name}() - FUNCTION MISSING (non-critical)`
      );
      result.warnings.push(
        `Optional function missing: ${funcCheck.schema}.${funcCheck.name}()`
      );
    } else if (verbose) {
      console.log(
        `  ${GREEN}✓${NC} ${funcCheck.schema}.${funcCheck.name}() - ${funcCheck.description}`
      );
    }
  }

  console.log();

  return result;
}

async function fixSchema(client: Client): Promise<void> {
  console.log(
    `${BLUE}═══════════════════════════════════════════════════════════════${NC}`
  );
  console.log(`${BLUE}  Auto-Fix Mode${NC}`);
  console.log(
    `${BLUE}═══════════════════════════════════════════════════════════════${NC}\n`
  );

  console.log(`${BLUE}[1/3] Detecting missing schema objects...${NC}`);

  // First, validate to see what's missing
  const initialValidation = await validateSchema(client, false);
  const missingTables = initialValidation.issues.filter((i) =>
    i.includes('Missing critical table')
  );
  const missingFunctions = initialValidation.issues.filter((i) =>
    i.includes('Missing critical function')
  );

  if (missingTables.length === 0 && missingFunctions.length === 0) {
    console.log(`${GREEN}✓ No missing objects detected${NC}\n`);
  } else {
    console.log(
      `  Found ${missingTables.length} missing tables and ${missingFunctions.length} missing functions\n`
    );
  }

  console.log(
    `${BLUE}[2/3] Extracting and creating missing objects from migrations...${NC}`
  );

  const migrationFile = path.join(MIGRATIONS_DIR, '0001_init.sql');
  const migrationSql = fs.readFileSync(migrationFile, 'utf-8');

  let objectsCreated = 0;

  // Extract and create missing tables
  for (const issue of missingTables) {
    const match = issue.match(/Missing critical table: (\w+)\.(\w+)/);
    if (!match) continue;

    const [, schema, table] = match;
    const tableName = `${schema}.${table}`;

    console.log(`  Creating ${tableName}...`);

    // Extract CREATE TABLE statement for this specific table
    const tableRegex = new RegExp(
      `CREATE TABLE IF NOT EXISTS ${schema}\\.${table}[\\s\\S]*?\\);`,
      'i'
    );
    const tableMatch = migrationSql.match(tableRegex);

    if (tableMatch) {
      try {
        await client.query(tableMatch[0]);
        console.log(`  ${GREEN}✓${NC} Created ${tableName}`);
        objectsCreated++;
      } catch (error: any) {
        console.log(
          `  ${RED}✗${NC} Failed to create ${tableName}: ${error.message}`
        );
      }
    } else {
      console.log(
        `  ${YELLOW}⚠${NC} Could not find CREATE statement for ${tableName} in migration`
      );
    }
  }

  // Extract and create missing functions
  for (const issue of missingFunctions) {
    const match = issue.match(/Missing critical function: (\w+)\.(\w+)/);
    if (!match) continue;

    const [, schema, funcName] = match;
    const functionName = `${schema}.${funcName}`;

    console.log(`  Creating ${functionName}()...`);

    // Extract CREATE FUNCTION statement
    const funcRegex = new RegExp(
      `CREATE OR REPLACE FUNCTION ${schema}\\.${funcName}\\(\\)[\\s\\S]*?\\$\\$;`,
      'i'
    );
    const funcMatch = migrationSql.match(funcRegex);

    if (funcMatch) {
      try {
        await client.query(funcMatch[0]);
        console.log(`  ${GREEN}✓${NC} Created ${functionName}()`);
        objectsCreated++;
      } catch (error: any) {
        console.log(
          `  ${RED}✗${NC} Failed to create ${functionName}(): ${error.message}`
        );
      }
    } else {
      console.log(
        `  ${YELLOW}⚠${NC} Could not find CREATE statement for ${functionName}() in migration`
      );
    }
  }

  if (objectsCreated > 0) {
    console.log(
      `\n${GREEN}✓ Created ${objectsCreated} missing object(s)${NC}\n`
    );
  } else {
    console.log(`\n${YELLOW}No objects were created${NC}\n`);
  }

  console.log(`${BLUE}[3/3] Verifying schema...${NC}`);
  const verifyResult = await validateSchema(client, false);

  if (verifyResult.passed) {
    console.log(`\n${GREEN}✓ Schema is now valid!${NC}`);
  } else {
    console.log(`\n${YELLOW}⚠ Some issues remain after fix attempt${NC}`);
    console.log(
      `${YELLOW}Remaining issues may require manual review of migration files${NC}`
    );
  }
}

function printSummary(result: ValidationResult): void {
  console.log(
    `${BLUE}═══════════════════════════════════════════════════════════════${NC}`
  );
  console.log(`${BLUE}  Summary${NC}`);
  console.log(
    `${BLUE}═══════════════════════════════════════════════════════════════${NC}\n`
  );

  console.log(`Tables checked:       ${result.tablesChecked}`);
  console.log(`Tables missing:       ${result.tablesMissing}`);
  console.log(`Functions checked:    ${result.functionsChecked}`);
  console.log(`Functions missing:    ${result.functionsMissing}`);
  console.log(`Migration issues:     ${result.migrationIssues}`);
  console.log(`Critical issues:      ${result.issues.length}`);
  console.log(`Warnings:             ${result.warnings.length}`);

  console.log();

  if (result.passed) {
    console.log(`${GREEN}✓ VALIDATION PASSED${NC}`);
    console.log(`${GREEN}Database schema is valid and ready for use.${NC}`);
  } else {
    console.log(`${RED}✗ VALIDATION FAILED${NC}`);
    console.log();
    console.log(`${RED}Critical Issues:${NC}`);
    result.issues.forEach((issue) => console.log(`  ${RED}•${NC} ${issue}`));

    if (result.warnings.length > 0) {
      console.log();
      console.log(`${YELLOW}Warnings:${NC}`);
      result.warnings.forEach((warning) =>
        console.log(`  ${YELLOW}•${NC} ${warning}`)
      );
    }

    console.log();
    console.log(`${BLUE}Recommended actions:${NC}`);
    console.log(
      `  1. Run: ${BLUE}npm run db:validate --fix${NC} to auto-repair`
    );
    console.log(`  2. Or manually run: ${BLUE}npm run migrate${NC}`);
    console.log(`  3. Or review migration files in apps/server/migrations/`);
  }

  console.log();
}

async function main() {
  const args = process.argv.slice(2);
  const fixMode = args.includes('--fix');
  const verbose = args.includes('--verbose');
  const diffMode = args.includes('--diff');

  let client: Client | null = null;

  try {
    client = await getClient();

    if (fixMode) {
      await fixSchema(client);
    } else {
      const result = await validateSchema(client, verbose);
      printSummary(result);

      if (!result.passed) {
        process.exit(1);
      }
    }
  } catch (error) {
    console.error(`${RED}✗ Fatal error:${NC}`, error);
    process.exit(2);
  } finally {
    if (client) {
      await client.end();
    }
  }
}

main().catch((error) => {
  console.error(`${RED}Fatal error:${NC}`, error);
  process.exit(2);
});

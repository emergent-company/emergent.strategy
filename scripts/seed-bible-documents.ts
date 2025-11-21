#!/usr/bin/env tsx
import path from 'node:path';
import fs from 'node:fs';
import * as dotenv from 'dotenv';

// Load environment variables
const envPath = process.env.DOTENV_PATH || path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log(`[seed-bible-documents] Loaded environment from ${envPath}\n`);
}

// Configuration
const API_URL = process.env.BIBLE_SEED_API_URL || 'http://localhost:3000';
const ACCESS_TOKEN = process.env.BIBLE_SEED_ACCESS_TOKEN;
const RATE_LIMIT_MS = parseInt(
  process.env.BIBLE_SEED_RATE_LIMIT_MS || '100',
  10
);

// Parse command-line arguments
const args = process.argv.slice(2);
let projectId: string | undefined;
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--project-id' && i + 1 < args.length) {
    projectId = args[i + 1];
    i++;
  } else if (args[i].startsWith('--project-id=')) {
    projectId = args[i].split('=')[1];
  } else if (args[i] === '--dry-run') {
    dryRun = true;
  }
}

// Validation
if (!projectId) {
  console.error('Error: Missing required argument: --project-id\n');
  console.log('Usage: npm run seed:bible -- --project-id=<uuid> [--dry-run]\n');
  console.log('Environment variables:');
  console.log(
    '  BIBLE_SEED_API_URL         API base URL (default: http://localhost:3000)'
  );
  console.log('  BIBLE_SEED_ACCESS_TOKEN    Required: Super admin JWT token');
  console.log(
    '  BIBLE_SEED_RATE_LIMIT_MS   Delay between uploads in ms (default: 100)'
  );
  process.exit(1);
}

if (!ACCESS_TOKEN) {
  console.error(
    'Error: Missing required environment variable: BIBLE_SEED_ACCESS_TOKEN\n'
  );
  console.log('Set BIBLE_SEED_ACCESS_TOKEN to your super admin JWT token');
  process.exit(1);
}

// Bible books directory
const BIBLE_BOOKS_DIR = path.resolve(process.cwd(), 'test-data/bible/books');

interface UploadResult {
  filename: string;
  success: boolean;
  documentId?: string;
  error?: string;
}

async function getBookFiles(): Promise<string[]> {
  if (!fs.existsSync(BIBLE_BOOKS_DIR)) {
    console.error(`Error: Bible books directory not found: ${BIBLE_BOOKS_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(BIBLE_BOOKS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort(); // Already sorted by filename prefix (01_, 02_, etc.)

  if (files.length === 0) {
    console.error(`Error: No markdown files found in ${BIBLE_BOOKS_DIR}`);
    process.exit(1);
  }

  return files;
}

async function uploadDocument(
  filename: string,
  content: string,
  index: number,
  total: number
): Promise<UploadResult> {
  const url = `${API_URL}/ingest/upload`;

  try {
    // Create form data
    const formData = new FormData();
    const blob = new Blob([content], { type: 'text/markdown' });
    formData.append('file', blob, filename);
    formData.append('filename', filename);
    formData.append('mimeType', 'text/markdown');
    formData.append('projectId', projectId!);

    console.log(`[${index}/${total}] Uploading ${filename}...`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        filename,
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const result = await response.json();
    console.log(
      `  ✓ Success (Document ID: ${result.documentId}, Chunks: ${result.chunks})`
    );

    return {
      filename,
      success: true,
      documentId: result.documentId,
    };
  } catch (error) {
    return {
      filename,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

async function main() {
  console.log('=== Bible Document Upload ===\n');
  console.log('Configuration:');
  console.log(`  API URL: ${API_URL}`);
  console.log(`  Project ID: ${projectId}`);
  console.log(`  Rate Limit: ${RATE_LIMIT_MS}ms between uploads`);
  console.log(`  Dry Run: ${dryRun ? 'YES' : 'NO'}`);
  console.log();

  const files = await getBookFiles();
  console.log(`Found ${files.length} Bible book files\n`);

  if (dryRun) {
    console.log('DRY RUN - Files that would be uploaded:\n');
    let totalSize = 0;
    files.forEach((file, index) => {
      const filePath = path.join(BIBLE_BOOKS_DIR, file);
      const stats = fs.statSync(filePath);
      totalSize += stats.size;
      console.log(`  ${index + 1}. ${file} (${formatBytes(stats.size)})`);
    });
    console.log(`\nTotal size: ${formatBytes(totalSize)}`);
    console.log(`Total files: ${files.length}`);
    console.log('\nNo uploads performed (dry run mode)');
    return;
  }

  console.log('Starting uploads...\n');

  const results: UploadResult[] = [];
  const startTime = Date.now();

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filePath = path.join(BIBLE_BOOKS_DIR, filename);
    const content = fs.readFileSync(filePath, 'utf-8');

    const result = await uploadDocument(filename, content, i + 1, files.length);
    results.push(result);

    // Rate limiting (skip on last iteration)
    if (i < files.length - 1 && RATE_LIMIT_MS > 0) {
      await delay(RATE_LIMIT_MS);
    }
  }

  const elapsedMs = Date.now() - startTime;
  const elapsedSec = (elapsedMs / 1000).toFixed(2);

  // Summary
  console.log('\n=== Upload Summary ===\n');
  console.log(`Total files: ${files.length}`);
  console.log(`Successful: ${results.filter((r) => r.success).length}`);
  console.log(`Failed: ${results.filter((r) => !r.success).length}`);
  console.log(`Time elapsed: ${elapsedSec}s`);

  const failures = results.filter((r) => !r.success);
  if (failures.length > 0) {
    console.log('\nFailed uploads:');
    failures.forEach((f) => {
      console.log(`  ✗ ${f.filename}: ${f.error}`);
    });
    console.log('\nUpload completed with errors');
    process.exit(1);
  }

  console.log('\n✓ All documents uploaded successfully!');
  console.log('\nNext Steps:');
  console.log('1. Navigate to the admin interface');
  console.log('2. Go to the Documents page for this project');
  console.log('3. Select one or more Bible documents');
  console.log(
    '4. Click "Extract" and choose the "Bible Knowledge Graph" template pack'
  );
  console.log('5. Wait for extraction to complete');
  console.log(
    '6. Explore the extracted entities and relationships in the Graph view'
  );
}

main();

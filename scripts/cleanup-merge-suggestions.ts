/**
 * Cleanup script to delete all existing merge suggestion notifications
 * Run with: npx tsx scripts/cleanup-merge-suggestions.ts
 */
import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();
  console.log('Connected to database');

  const result = await client.query(`
    DELETE FROM kb.notifications 
    WHERE type = 'agent:merge_suggestion'
    RETURNING id
  `);

  console.log(`Deleted ${result.rowCount} merge suggestion notifications`);

  await client.end();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * One-time script to fix conversation ownership for specific user
 * 
 * Usage: node fix-my-conversations.mjs
 * 
 * This updates conversations owned by the hashed UUID to use the original sub value
 */

import pg from 'pg';
import crypto from 'crypto';
const { Client } = pg;

const USER_SUB = '335517149097361411'; // Your actual sub from localStorage
const HASHED_UUID = '89085f3d-0531-537a-96f6-e19eebd43770'; // The UUID in database

async function main() {
  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'nexus',
    user: process.env.POSTGRES_USER || 'nexus',
    password: process.env.POSTGRES_PASSWORD || 'nexus',
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Verify the UUID matches
    const hash = crypto.createHash('sha1').update(USER_SUB).digest();
    const bytes = Buffer.from(hash.subarray(0, 16));
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytes.toString('hex');
    const computedUuid = `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;

    console.log(`Verifying: ${USER_SUB} → ${computedUuid}`);
    if (computedUuid !== HASHED_UUID) {
      console.error(`❌ UUID mismatch! Expected ${HASHED_UUID}, got ${computedUuid}`);
      process.exit(1);
    }
    console.log('✓ UUID verified');

    // Find affected conversations
    const { rows: conversations } = await client.query(
      `SELECT id, title, owner_subject_id, created_at 
       FROM kb.chat_conversations 
       WHERE owner_subject_id = $1`,
      [HASHED_UUID]
    );

    console.log(`\nFound ${conversations.length} conversations with hashed owner ID:`);
    conversations.forEach(c => {
      console.log(`  - ${c.id.substring(0, 8)}... "${c.title}" (${c.created_at.toISOString().split('T')[0]})`);
    });

    if (conversations.length === 0) {
      console.log('✓ No conversations to update');
      return;
    }

    // Confirm update
    console.log(`\nWill update owner_subject_id from ${HASHED_UUID} to ${USER_SUB}`);
    console.log('Press Ctrl+C to cancel, or wait 3 seconds to proceed...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Update conversations
    const result = await client.query(
      `UPDATE kb.chat_conversations 
       SET owner_subject_id = $1 
       WHERE owner_subject_id = $2`,
      [USER_SUB, HASHED_UUID]
    );

    console.log(`✓ Updated ${result.rowCount} conversations`);
    console.log('✓ You should now be able to delete your shared conversations!');

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();

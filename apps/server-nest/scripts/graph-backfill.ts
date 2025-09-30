#!/usr/bin/env ts-node
/*
 * Graph Backfill Script
 * Idempotently copies legacy objects & relationships into new graph tables.
 *
 * Usage:
 *   npm run graph:backfill -- --dry-run
 *   npm run graph:backfill
 *
 * Exit codes:
 *   0 success (including no-op)
 *   1 unexpected error
 */
import 'dotenv/config';
import { Client } from 'pg';

interface BackfillStats {
    objectsInserted: number;
    objectsSkipped: number;
    relationshipsInserted: number;
    relationshipsSkipped: number;
    dryRun: boolean;
    elapsedMs: number;
    notes: string[];
}

function env(name: string, fallback?: string) {
    const v = process.env[name] ?? fallback;
    if (!v) throw new Error(`Missing required env var ${name}`);
    return v;
}

async function main() {
    const dryRun = process.argv.includes('--dry-run');
    const start = Date.now();
    const client = new Client({
        connectionString: process.env.DATABASE_URL || undefined,
        host: process.env.PGHOST || 'localhost',
        port: +(process.env.PGPORT || 5432),
        user: env('PGUSER', 'postgres'),
        password: env('PGPASSWORD', 'postgres'),
        database: env('PGDATABASE', 'postgres')
    });
    await client.connect();

    const stats: BackfillStats = {
        objectsInserted: 0,
        objectsSkipped: 0,
        relationshipsInserted: 0,
        relationshipsSkipped: 0,
        dryRun,
        elapsedMs: 0,
        notes: []
    };

    // Placeholder legacy sources: adjust if real legacy tables differ
    const legacyObjectsTable = 'kb.objects';
    const legacyRelsTable = 'kb.relationships';

    // Detect presence of legacy tables
    const tablesRes = await client.query<{ relname: string }>(
        `SELECT relname FROM pg_class WHERE relkind = 'r' AND relname IN ($1,$2)`,
        [legacyObjectsTable.split('.').pop(), legacyRelsTable.split('.').pop()]
    );
    const foundNames = new Set(tablesRes.rows.map(r => r.relname));
    const haveObjects = foundNames.has(legacyObjectsTable.split('.').pop()!);
    const haveRels = foundNames.has(legacyRelsTable.split('.').pop()!);
    if (!haveObjects && !haveRels) {
        stats.notes.push('No legacy tables detected; nothing to backfill.');
        stats.elapsedMs = Date.now() - start;
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(stats, null, 2));
        await client.end();
        return;
    }

    try {
        await client.query('BEGIN');

        // Objects backfill (assumes columns: id UUID, type TEXT, key TEXT NULL, properties JSONB, labels TEXT[], created_at, deleted_at, org_id, project_id)
        if (haveObjects) {
            const objectsSourceCols = 'id, org_id, project_id, type, key, 1 as version, NULL::uuid as supersedes_id, NULL::uuid as canonical_id, properties, labels, deleted_at, created_at';
            const insertObjectsSql = `INSERT INTO kb.graph_objects (id, org_id, project_id, type, key, version, supersedes_id, canonical_id, properties, labels, deleted_at, created_at)
        SELECT ${objectsSourceCols} FROM ${legacyObjectsTable} src
        ON CONFLICT (id) DO NOTHING`;
            const beforeCount = await client.query('SELECT count(*)::int AS c FROM kb.graph_objects');
            await client.query(insertObjectsSql);
            const afterCount = await client.query('SELECT count(*)::int AS c FROM kb.graph_objects');
            stats.objectsInserted = (afterCount.rows[0].c - beforeCount.rows[0].c);
            // Approx skipped: count of legacy - inserted (best effort)
            const legacyCount = await client.query(`SELECT count(*)::int AS c FROM ${legacyObjectsTable}`);
            stats.objectsSkipped = legacyCount.rows[0].c - stats.objectsInserted;
        } else {
            stats.notes.push('Legacy objects table not found.');
        }

        // Relationships backfill (assumes columns: id UUID, type TEXT, src_id UUID, dst_id UUID, deleted_at, created_at)
        if (haveRels) {
            const relsSourceCols = 'id, type, src_id, dst_id, deleted_at, created_at';
            const insertRelsSql = `INSERT INTO kb.graph_relationships (id, type, src_id, dst_id, deleted_at, created_at)
        SELECT ${relsSourceCols} FROM ${legacyRelsTable} src
        ON CONFLICT (id) DO NOTHING`;
            const beforeRel = await client.query('SELECT count(*)::int AS c FROM kb.graph_relationships');
            await client.query(insertRelsSql);
            const afterRel = await client.query('SELECT count(*)::int AS c FROM kb.graph_relationships');
            stats.relationshipsInserted = (afterRel.rows[0].c - beforeRel.rows[0].c);
            const legacyRelCount = await client.query(`SELECT count(*)::int AS c FROM ${legacyRelsTable}`);
            stats.relationshipsSkipped = legacyRelCount.rows[0].c - stats.relationshipsInserted;
        } else {
            stats.notes.push('Legacy relationships table not found.');
        }

        if (dryRun) {
            await client.query('ROLLBACK');
            stats.notes.push('Dry run: transaction rolled back.');
        } else {
            await client.query('COMMIT');
        }
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch { }
        throw err;
    } finally {
        stats.elapsedMs = Date.now() - start;
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(stats, null, 2));
        await client.end();
    }
}

main().catch(err => {
    // eslint-disable-next-line no-console
    console.error('[graph-backfill] failed', err);
    process.exit(1);
});

import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { diffProperties } from '../../graph/change-summary';
import { CreateGraphObjectDto } from './dto/create-graph-object.dto';
import { PatchGraphObjectDto } from './dto/patch-graph-object.dto';
import { GraphObjectDto, GraphObjectRow, GraphRelationshipDto, GraphRelationshipRow, GraphTraversalResult } from './graph.types';
import { TraverseGraphDto } from './dto/traverse-graph.dto';
import { CreateGraphRelationshipDto } from './dto/create-graph-relationship.dto';
import { SchemaRegistryService } from './schema-registry.service';
import { PatchGraphRelationshipDto } from './dto/patch-graph-relationship.dto';

@Injectable()
export class GraphService {
    constructor(private readonly db: DatabaseService, private readonly schemaRegistry: SchemaRegistryService) { }

    async createObject(input: CreateGraphObjectDto): Promise<GraphObjectDto> {
        const client = await this.db.getClient();
        const { type, key, properties = {}, labels = [], org_id = null, project_id = null } = input as any;
        try {
            // Schema validation (if schema exists for type)
            const validator = await this.schemaRegistry.getObjectValidator(project_id ?? null, type);
            if (validator) {
                const valid = validator(properties || {});
                if (!valid) {
                    throw new BadRequestException({ code: 'object_schema_validation_failed', errors: validator.errors });
                }
            }
            await client.query('BEGIN');
            if (key) {
                // Transaction-scoped advisory lock to serialize creation by logical identity
                await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`obj|${project_id}|${type}|${key}`]);
                // Head = max(version) for (project_id,type,key)
                const existing = await client.query<GraphObjectRow>(
                    `SELECT id, org_id, project_id, canonical_id, supersedes_id, version, type, key, properties, labels, created_at
                     FROM kb.graph_objects
                     WHERE project_id IS NOT DISTINCT FROM $1 AND type=$2 AND key=$3
                     ORDER BY version DESC
                     LIMIT 1`, [project_id, type, key]
                );
                if (existing.rowCount) {
                    throw new BadRequestException('object_key_exists');
                }
            }
            const row = await client.query<GraphObjectRow>(
                `INSERT INTO kb.graph_objects(type, key, properties, labels, version, canonical_id, org_id, project_id)
                 VALUES ($1,$2,$3,$4,1,gen_random_uuid(),$5,$6)
                 RETURNING id, org_id, project_id, canonical_id, supersedes_id, version, type, key, properties, labels, deleted_at, created_at`,
                [type, key ?? null, properties, labels, org_id, project_id]
            );
            await client.query('COMMIT');
            return row.rows[0];
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch { /* ignore */ }
            throw e;
        } finally { client.release(); }
    }

    async getObject(id: string): Promise<GraphObjectDto> {
        const res = await this.db.query<GraphObjectRow>(
            `SELECT id, org_id, project_id, canonical_id, supersedes_id, version, type, key, properties, labels, deleted_at, created_at
             FROM kb.graph_objects WHERE id=$1`, [id]);
        if (!res.rowCount) throw new NotFoundException('object_not_found');
        return res.rows[0];
    }

    async patchObject(id: string, patch: PatchGraphObjectDto): Promise<GraphObjectDto> {
        const client = await this.db.getClient();
        try {
            await client.query('BEGIN');
            const currentRes = await client.query<GraphObjectRow>(
                `SELECT * FROM kb.graph_objects WHERE id=$1`, [id]);
            if (!currentRes.rowCount) throw new NotFoundException('object_not_found');
            const current = currentRes.rows[0];
            // Serialize patches for this logical object (canonical id)
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`obj|${current.canonical_id}`]);
            // Ensure this id is still the head (no newer version exists)
            const newer = await client.query<{ id: string }>(
                'SELECT id FROM kb.graph_objects WHERE canonical_id=$1 AND version > $2 LIMIT 1', [current.canonical_id, current.version]
            );
            if (newer.rowCount) throw new BadRequestException('cannot_patch_non_head_version');
            const nextProps = patch.properties ? { ...current.properties, ...patch.properties } : current.properties;
            // Validate with potential updated properties
            const validator = await this.schemaRegistry.getObjectValidator((current as any).project_id ?? null, current.type);
            if (validator) {
                const valid = validator(nextProps);
                if (!valid) throw new BadRequestException({ code: 'object_schema_validation_failed', errors: validator.errors });
            }
            let nextLabels = current.labels;
            if (patch.labels) {
                nextLabels = patch.replaceLabels ? patch.labels : Array.from(new Set([...current.labels, ...patch.labels]));
            } else if (patch.replaceLabels) {
                nextLabels = [];
            }
            const diff = diffProperties(current.properties, nextProps);
            const labelsChanged = JSON.stringify(current.labels) !== JSON.stringify(nextLabels);
            if (!diff && !labelsChanged) throw new BadRequestException('no_effective_change');
            const inserted = await client.query<GraphObjectRow>(
                `INSERT INTO kb.graph_objects(type, key, properties, labels, version, canonical_id, supersedes_id, org_id, project_id, deleted_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL)
                 RETURNING id, org_id, project_id, canonical_id, supersedes_id, version, type, key, properties, labels, deleted_at, created_at`,
                [current.type, current.key, nextProps, nextLabels, current.version + 1, current.canonical_id, current.id, (current as any).org_id ?? null, (current as any).project_id ?? null]
            );
            await client.query('COMMIT');
            return { ...inserted.rows[0], diff };
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch { /* ignore */ }
            throw e;
        } finally { client.release(); }
    }

    async listHistory(id: string, limitParam = 20, cursor?: string): Promise<{ items: GraphObjectDto[]; next_cursor?: string }> {
        const limit = Number(limitParam) || 20;
        // Resolve canonical id first
        const base = await this.db.query<{ canonical_id: string }>(`SELECT canonical_id FROM kb.graph_objects WHERE id=$1`, [id]);
        if (!base.rowCount) throw new NotFoundException('object_not_found');
        const canonicalId = base.rows[0].canonical_id;
        const params: any[] = [canonicalId];
        let cursorClause = '';
        if (cursor) { params.push(cursor); cursorClause = ' AND version < $2'; }
        params.push(limit + 1);
        const res = await this.db.query<GraphObjectRow>(
            `SELECT id, org_id, project_id, canonical_id, supersedes_id, version, type, key, properties, labels, deleted_at, created_at
             FROM kb.graph_objects WHERE canonical_id=$1${cursorClause}
       ORDER BY version DESC
       LIMIT $${params.length}`, params);
        let next_cursor: string | undefined;
        let rows = res.rows;
        // We fetched limit+1 to decide on a next cursor. Use the last returned item's version
        // (not the extra one) as cursor so predicate version < cursor fetches strictly older versions.
        if (rows.length > limit) { next_cursor = rows[limit - 1].version.toString(); rows = rows.slice(0, limit); }
        return { items: rows, next_cursor };
    }

    // ---------------- Relationships ----------------
    async createRelationship(input: CreateGraphRelationshipDto, orgId: string, projectId: string): Promise<GraphRelationshipDto> {
        const { type, src_id, dst_id, properties = {} } = input;
        if (src_id === dst_id) throw new BadRequestException('self_loop_not_allowed');
        const client = await this.db.getClient();
        try {
            await client.query('BEGIN');
            // Serialize relationship creation/upsert on logical identity
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`rel|${projectId}|${type}|${src_id}|${dst_id}`]);
            const head = await client.query<GraphRelationshipRow>(
                `SELECT * FROM kb.graph_relationships
                 WHERE project_id=$1 AND type=$2 AND src_id=$3 AND dst_id=$4
                 ORDER BY version DESC LIMIT 1`,
                [projectId, type, src_id, dst_id]
            );
            if (!head.rowCount) {
                // Validate relationship properties if schema exists
                const validator = await this.schemaRegistry.getRelationshipValidator(projectId, type);
                if (validator) {
                    const valid = validator(properties || {});
                    if (!valid) throw new BadRequestException({ code: 'relationship_schema_validation_failed', errors: validator.errors });
                }
                try { await client.query('DROP INDEX IF EXISTS kb.idx_graph_rel_unique'); } catch { /* ignore */ }
                const inserted = await client.query<GraphRelationshipRow>(
                    `INSERT INTO kb.graph_relationships(org_id, project_id, type, src_id, dst_id, properties, version, canonical_id)
                     VALUES ($1,$2,$3,$4,$5,$6,1,gen_random_uuid())
                     RETURNING id, org_id, project_id, type, src_id, dst_id, properties, version, supersedes_id, canonical_id, weight, valid_from, valid_to, created_at`,
                    [orgId, projectId, type, src_id, dst_id, properties]
                );
                await client.query('COMMIT');
                return inserted.rows[0];
            }
            const current = head.rows[0];
            const diff = diffProperties(current.properties, properties);
            if (!diff) {
                await client.query('ROLLBACK');
                return current; // no-op
            }
            const nextVersion = (current.version || 1) + 1;
            // Validate updated relationship properties if schema exists
            const validator = await this.schemaRegistry.getRelationshipValidator(current.project_id, current.type);
            if (validator) {
                const valid = validator(properties || {});
                if (!valid) throw new BadRequestException({ code: 'relationship_schema_validation_failed', errors: validator.errors });
            }
            const inserted = await client.query<GraphRelationshipRow>(
                `INSERT INTO kb.graph_relationships(org_id, project_id, type, src_id, dst_id, properties, version, canonical_id, supersedes_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                 RETURNING id, org_id, project_id, type, src_id, dst_id, properties, version, supersedes_id, canonical_id, weight, valid_from, valid_to, created_at`,
                [orgId, projectId, type, src_id, dst_id, properties, nextVersion, current.canonical_id, current.id]
            );
            await client.query('COMMIT');
            return { ...inserted.rows[0], diff };
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch { /* ignore */ }
            throw e;
        } finally {
            client.release();
        }
    }

    async getRelationship(id: string): Promise<GraphRelationshipDto> {
        const res = await this.db.query<GraphRelationshipRow>(
            `SELECT id, org_id, project_id, type, src_id, dst_id, properties, version, supersedes_id, canonical_id, weight, valid_from, valid_to, deleted_at, created_at
             FROM kb.graph_relationships WHERE id=$1 AND deleted_at IS NULL`, [id]);
        if (!res.rowCount) throw new NotFoundException('relationship_not_found');
        return res.rows[0];
    }

    async patchRelationship(id: string, patch: PatchGraphRelationshipDto): Promise<GraphRelationshipDto> {
        const client = await this.db.getClient();
        try {
            await client.query('BEGIN');
            const currentRes = await client.query<GraphRelationshipRow>(
                `SELECT * FROM kb.graph_relationships WHERE id=$1 AND deleted_at IS NULL`, [id]);
            if (!currentRes.rowCount) throw new NotFoundException('relationship_not_found');
            const current = currentRes.rows[0];
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`rel|${current.project_id}|${current.type}|${current.src_id}|${current.dst_id}`]);
            // Ensure current is still head
            const newer = await client.query<{ id: string }>('SELECT id FROM kb.graph_relationships WHERE canonical_id=$1 AND version > $2 LIMIT 1', [current.canonical_id, current.version]);
            if (newer.rowCount) throw new BadRequestException('cannot_patch_non_head_version');
            const nextProps = patch.properties ? { ...current.properties, ...patch.properties } : current.properties;
            const diff = diffProperties(current.properties, nextProps);
            if (!diff) throw new BadRequestException('no_effective_change');
            const nextVersion = (current.version || 1) + 1;
            try { await client.query('DROP INDEX IF EXISTS kb.idx_graph_rel_unique'); } catch { /* ignore */ }
            const inserted = await client.query<GraphRelationshipRow>(
                `INSERT INTO kb.graph_relationships(org_id, project_id, type, src_id, dst_id, properties, version, canonical_id, supersedes_id, deleted_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL)
                 RETURNING id, org_id, project_id, type, src_id, dst_id, properties, version, supersedes_id, canonical_id, weight, valid_from, valid_to, deleted_at, created_at`,
                [current.org_id, current.project_id, current.type, current.src_id, current.dst_id, nextProps, nextVersion, current.canonical_id, current.id]
            );
            await client.query('COMMIT');
            return { ...inserted.rows[0], diff };
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch { /* ignore */ }
            throw e;
        } finally {
            client.release();
        }
    }

    async deleteObject(id: string): Promise<GraphObjectDto> {
        const client = await this.db.getClient();
        try {
            await client.query('BEGIN');
            const currentRes = await client.query<GraphObjectRow>(`SELECT * FROM kb.graph_objects WHERE id=$1`, [id]);
            if (!currentRes.rowCount) throw new NotFoundException('object_not_found');
            const current = currentRes.rows[0];
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`obj|${current.canonical_id}`]);
            const head = await client.query<GraphObjectRow>(`SELECT * FROM kb.graph_objects WHERE canonical_id=$1 ORDER BY version DESC LIMIT 1`, [current.canonical_id]);
            if (!head.rowCount) throw new NotFoundException('object_not_found');
            if (head.rows[0].deleted_at) throw new BadRequestException('already_deleted');
            const tombstone = await client.query<GraphObjectRow>(
                `INSERT INTO kb.graph_objects(type, key, properties, labels, version, canonical_id, supersedes_id, org_id, project_id, deleted_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
                 RETURNING id, org_id, project_id, canonical_id, supersedes_id, version, type, key, properties, labels, deleted_at, created_at`,
                [head.rows[0].type, head.rows[0].key, head.rows[0].properties, head.rows[0].labels, head.rows[0].version + 1, head.rows[0].canonical_id, head.rows[0].id, (head.rows[0] as any).org_id ?? null, (head.rows[0] as any).project_id ?? null]
            );
            await client.query('COMMIT');
            return tombstone.rows[0];
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch {/* ignore */ }
            throw e;
        } finally { client.release(); }
    }

    async restoreObject(id: string): Promise<GraphObjectDto> {
        const client = await this.db.getClient();
        try {
            await client.query('BEGIN');
            // id may be tombstone or any historical version; resolve canonical
            const base = await client.query<GraphObjectRow>(`SELECT * FROM kb.graph_objects WHERE id=$1`, [id]);
            if (!base.rowCount) throw new NotFoundException('object_not_found');
            const canonicalId = base.rows[0].canonical_id;
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`obj|${canonicalId}`]);
            const head = await client.query<GraphObjectRow>(`SELECT * FROM kb.graph_objects WHERE canonical_id=$1 ORDER BY version DESC LIMIT 1`, [canonicalId]);
            if (!head.rowCount) throw new NotFoundException('object_not_found');
            if (!head.rows[0].deleted_at) throw new BadRequestException('not_deleted');
            const prevLive = await client.query<GraphObjectRow>(
                `SELECT * FROM kb.graph_objects WHERE canonical_id=$1 AND deleted_at IS NULL ORDER BY version DESC LIMIT 1`, [canonicalId]);
            if (!prevLive.rowCount) throw new BadRequestException('no_prior_live_version');
            const restored = await client.query<GraphObjectRow>(
                `INSERT INTO kb.graph_objects(type, key, properties, labels, version, canonical_id, supersedes_id, org_id, project_id, deleted_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL)
                 RETURNING id, org_id, project_id, canonical_id, supersedes_id, version, type, key, properties, labels, deleted_at, created_at`,
                [prevLive.rows[0].type, prevLive.rows[0].key, prevLive.rows[0].properties, prevLive.rows[0].labels, head.rows[0].version + 1, canonicalId, head.rows[0].id, (prevLive.rows[0] as any).org_id ?? null, (prevLive.rows[0] as any).project_id ?? null]
            );
            await client.query('COMMIT');
            return restored.rows[0];
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch {/* ignore */ }
            throw e;
        } finally { client.release(); }
    }

    async deleteRelationship(id: string): Promise<GraphRelationshipDto> {
        const client = await this.db.getClient();
        try {
            await client.query('BEGIN');
            const currentRes = await client.query<GraphRelationshipRow>(`SELECT * FROM kb.graph_relationships WHERE id=$1`, [id]);
            if (!currentRes.rowCount) throw new NotFoundException('relationship_not_found');
            const current = currentRes.rows[0];
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`rel|${current.project_id}|${current.type}|${current.src_id}|${current.dst_id}`]);
            const headRes = await client.query<GraphRelationshipRow>(`SELECT * FROM kb.graph_relationships WHERE canonical_id=$1 ORDER BY version DESC LIMIT 1`, [current.canonical_id]);
            if (!headRes.rowCount) throw new NotFoundException('relationship_not_found');
            const head = headRes.rows[0];
            if ((head as any).deleted_at) throw new BadRequestException('already_deleted');
            const tombstone = await client.query<GraphRelationshipRow>(
                `INSERT INTO kb.graph_relationships(org_id, project_id, type, src_id, dst_id, properties, version, canonical_id, supersedes_id, deleted_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
                 RETURNING id, org_id, project_id, type, src_id, dst_id, properties, version, supersedes_id, canonical_id, weight, valid_from, valid_to, deleted_at, created_at`,
                [head.org_id, head.project_id, head.type, head.src_id, head.dst_id, head.properties, (head.version || 1) + 1, head.canonical_id, head.id]
            );
            await client.query('COMMIT');
            return tombstone.rows[0];
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch {/* ignore */ }
            throw e;
        } finally { client.release(); }
    }

    async restoreRelationship(id: string): Promise<GraphRelationshipDto> {
        const client = await this.db.getClient();
        try {
            await client.query('BEGIN');
            const base = await client.query<GraphRelationshipRow>(`SELECT * FROM kb.graph_relationships WHERE id=$1`, [id]);
            if (!base.rowCount) throw new NotFoundException('relationship_not_found');
            const canonicalId = base.rows[0].canonical_id;
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`rel|${base.rows[0].project_id}|${base.rows[0].type}|${base.rows[0].src_id}|${base.rows[0].dst_id}`]);
            const headRes = await client.query<GraphRelationshipRow>(`SELECT * FROM kb.graph_relationships WHERE canonical_id=$1 ORDER BY version DESC LIMIT 1`, [canonicalId]);
            if (!headRes.rowCount) throw new NotFoundException('relationship_not_found');
            const head = headRes.rows[0];
            if (!(head as any).deleted_at) throw new BadRequestException('not_deleted');
            const prevLive = await client.query<GraphRelationshipRow>(
                `SELECT * FROM kb.graph_relationships WHERE canonical_id=$1 AND deleted_at IS NULL ORDER BY version DESC LIMIT 1`, [canonicalId]);
            if (!prevLive.rowCount) throw new BadRequestException('no_prior_live_version');
            const prev = prevLive.rows[0];
            const restored = await client.query<GraphRelationshipRow>(
                `INSERT INTO kb.graph_relationships(org_id, project_id, type, src_id, dst_id, properties, version, canonical_id, supersedes_id, deleted_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL)
                 RETURNING id, org_id, project_id, type, src_id, dst_id, properties, version, supersedes_id, canonical_id, weight, valid_from, valid_to, deleted_at, created_at`,
                [prev.org_id, prev.project_id, prev.type, prev.src_id, prev.dst_id, prev.properties, (head.version || 1) + 1, canonicalId, head.id]
            );
            await client.query('COMMIT');
            return restored.rows[0];
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch {/* ignore */ }
            throw e;
        } finally { client.release(); }
    }

    async listEdges(objectId: string, direction: 'out' | 'in' | 'both', limit = 50): Promise<GraphRelationshipDto[]> {
        const dirClause = direction === 'out' ? 'r.src_id = $1' : direction === 'in' ? 'r.dst_id = $1' : '(r.src_id = $1 OR r.dst_id = $1)';
        // DISTINCT ON canonical_id to pick head (highest version)
        // IMPORTANT (graph-versioning): Select head (may be tombstone) first, THEN filter deleted heads outside.
        // Never push `deleted_at IS NULL` into the inner DISTINCT ON query or stale versions can resurface.
        // Previous implementation filtered deleted_at within the inner selection which could resurface a prior
        // non-deleted version after a tombstone delete. We now select the head (which may be deleted) then
        // filter out deleted heads in an outer query so a deleted relationship is fully hidden.
        const sql = `SELECT * FROM (
                     SELECT DISTINCT ON (r.canonical_id) r.id, r.org_id, r.project_id, r.type, r.src_id, r.dst_id, r.properties, r.version, r.supersedes_id, r.canonical_id, r.weight, r.valid_from, r.valid_to, r.deleted_at, r.created_at
                     FROM kb.graph_relationships r
                     WHERE ${dirClause}
                     ORDER BY r.canonical_id, r.version DESC
                 ) h
                 WHERE h.deleted_at IS NULL
                 LIMIT $2`;
        const res = await this.db.query<GraphRelationshipRow>(sql, [objectId, limit]);
        return res.rows;
    }

    // ---------------- Search (basic filtering + forward cursor by created_at) ----------------
    async searchObjects(opts: { type?: string; key?: string; label?: string; limit?: number; cursor?: string }): Promise<{ items: GraphObjectDto[]; next_cursor?: string }> {
        const { type, key, label, limit = 20, cursor } = opts;
        // Head selection (may include deleted heads) followed by outer filter to exclude tombstones to avoid
        // resurfacing stale pre-delete versions.
        // Pattern reference: see docs/graph-versioning.md (head-first then filter).
        const filters: string[] = [];
        const params: any[] = [];
        let idx = 1;
        if (type) { filters.push(`t.type = $${idx++}`); params.push(type); }
        if (key) { filters.push(`t.key = $${idx++}`); params.push(key); }
        if (label) { filters.push(`$${idx} = ANY(t.labels)`); params.push(label); idx++; }
        if (cursor) { filters.push(`t.created_at > $${idx++}`); params.push(new Date(cursor)); }
        params.push(limit + 1);
        const where = filters.length ? 'AND ' + filters.join(' AND ') : '';
        const sql = `SELECT * FROM (
              SELECT DISTINCT ON (canonical_id) id, org_id, project_id, canonical_id, supersedes_id, version, type, key, properties, labels, deleted_at, created_at
              FROM kb.graph_objects
              ORDER BY canonical_id, version DESC
          ) t
          WHERE t.deleted_at IS NULL ${where}
          ORDER BY t.created_at ASC
          LIMIT $${params.length}`;
        const res = await this.db.query<GraphObjectRow>(sql, params);
        let next_cursor: string | undefined;
        let rows = res.rows;
        if (rows.length > limit) { rows = rows.slice(0, limit); }
        if (rows.length) { next_cursor = new Date(rows[rows.length - 1].created_at as any).toISOString(); }
        return { items: rows, next_cursor };
    }

    async searchRelationships(opts: { type?: string; src_id?: string; dst_id?: string; limit?: number; cursor?: string }): Promise<{ items: GraphRelationshipDto[]; next_cursor?: string }> {
        const { type, src_id, dst_id, limit = 20, cursor } = opts;
        const filters: string[] = [];
        const params: any[] = [];
        let idx = 1;
        if (type) { filters.push(`h.type = $${idx++}`); params.push(type); }
        if (src_id) { filters.push(`h.src_id = $${idx++}`); params.push(src_id); }
        if (dst_id) { filters.push(`h.dst_id = $${idx++}`); params.push(dst_id); }
        if (cursor) { filters.push(`h.created_at > $${idx++}`); params.push(new Date(cursor)); }
        params.push(limit + 1);
        const where = filters.length ? 'AND ' + filters.join(' AND ') : '';
        const sql = `SELECT * FROM (
                        SELECT DISTINCT ON (r.canonical_id) r.id, r.org_id, r.project_id, r.type, r.src_id, r.dst_id, r.properties, r.version, r.supersedes_id, r.canonical_id, r.weight, r.valid_from, r.valid_to, r.deleted_at, r.created_at
                        FROM kb.graph_relationships r
                        ORDER BY r.canonical_id, r.version DESC
                    ) h
                    WHERE h.deleted_at IS NULL ${where}
                    ORDER BY h.created_at ASC
                    LIMIT $${params.length}`;
        const res = await this.db.query<GraphRelationshipRow>(sql, params);
        let rows = res.rows;
        let next_cursor: string | undefined;
        if (rows.length > limit) { rows = rows.slice(0, limit); }
        if (rows.length) { next_cursor = new Date(rows[rows.length - 1].created_at as any).toISOString(); }
        return { items: rows, next_cursor };
    }

    async listRelationshipHistory(id: string, limitParam = 20, cursor?: string): Promise<{ items: GraphRelationshipDto[]; next_cursor?: string }> {
        const limit = Number(limitParam) || 20;
        const base = await this.db.query<{ canonical_id: string }>(`SELECT canonical_id FROM kb.graph_relationships WHERE id=$1`, [id]);
        if (!base.rowCount) throw new NotFoundException('relationship_not_found');
        const canonicalId = base.rows[0].canonical_id;
        const params: any[] = [canonicalId];
        let cursorClause = '';
        if (cursor) {
            // Fast path: determine current head version so a cursor >= head yields empty set per pagination contract
            const head = await this.db.query<{ v: number }>(`SELECT version as v FROM kb.graph_relationships WHERE canonical_id=$1 ORDER BY version DESC LIMIT 1`, [canonicalId]);
            if (head.rowCount && parseInt(cursor, 10) >= head.rows[0].v) {
                if (process.env.NODE_ENV === 'test') {
                    // eslint-disable-next-line no-console
                    console.log('[history debug][relationship] cursor beyond head -> empty set', { cursor, head: head.rows[0].v });
                }
                return { items: [], next_cursor: undefined };
            }
            params.push(cursor); cursorClause = ' AND version < $2';
        }
        params.push(limit + 1);
        const res = await this.db.query<GraphRelationshipRow>(
            `SELECT id, org_id, project_id, type, src_id, dst_id, properties, version, supersedes_id, canonical_id, weight, valid_from, valid_to, deleted_at, created_at
             FROM kb.graph_relationships WHERE canonical_id=$1${cursorClause}
             ORDER BY version DESC
             LIMIT $${params.length}`, params);
        let next_cursor: string | undefined;
        let rows = res.rows;
        if (rows.length > limit) { next_cursor = rows[limit - 1].version?.toString(); rows = rows.slice(0, limit); }
        return { items: rows, next_cursor };
    }

    // ---------------- Traversal ----------------
    async traverse(dto: TraverseGraphDto): Promise<GraphTraversalResult> {
        const direction = dto.direction || 'both';
        const maxDepth = dto.max_depth ?? 2;
        const maxNodes = dto.max_nodes ?? 200;
        const maxEdges = dto.max_edges ?? 400;
        const relTypeFilter = dto.relationship_types?.length ? new Set(dto.relationship_types) : undefined;
        const objTypeFilter = dto.object_types?.length ? new Set(dto.object_types) : undefined;
        const labelFilter = dto.labels?.length ? new Set(dto.labels) : undefined;

        // Seed roots
        const queue: { id: string; depth: number }[] = dto.root_ids.map(id => ({ id, depth: 0 }));
        const seen = new Set<string>();
        const nodes: Record<string, { depth: number; type: string; key?: string | null; labels: string[] }> = {};
        const edges: { id: string; type: string; src_id: string; dst_id: string }[] = [];
        let truncated = false;
        let maxDepthReached = 0;

        while (queue.length) {
            const current = queue.shift()!;
            if (seen.has(current.id)) continue;
            seen.add(current.id);

            // Fetch object (latest version). If missing, skip.
            const objRes = await this.db.query<GraphObjectRow>(
                `SELECT id, type, key, labels, deleted_at FROM kb.graph_objects WHERE id=$1`, [current.id]);
            if (!objRes.rowCount) continue;
            const row = objRes.rows[0];
            if (row.deleted_at) continue; // skip deleted heads
            // Apply object filters (if fails, do not include or expand further)
            if (objTypeFilter && !objTypeFilter.has(row.type)) continue;
            if (labelFilter && !row.labels.some(l => labelFilter.has(l))) continue;
            nodes[current.id] = { depth: current.depth, type: row.type, key: row.key, labels: row.labels };
            maxDepthReached = Math.max(maxDepthReached, current.depth);
            if (Object.keys(nodes).length >= maxNodes) { truncated = true; break; }
            if (current.depth >= maxDepth) continue; // do not expand further

            // Collect edges adjacent in requested direction
            const dirClauses: string[] = [];
            const params: any[] = [current.id];
            if (direction === 'out') dirClauses.push('src_id = $1');
            else if (direction === 'in') dirClauses.push('dst_id = $1');
            else dirClauses.push('(src_id = $1 OR dst_id = $1)');
            if (relTypeFilter) {
                // dynamic IN list
                const types = Array.from(relTypeFilter);
                params.push(...types);
                dirClauses.push(`type = ANY(ARRAY[${types.map((_, i) => '$' + (i + 2)).join(',')}])`);
            }
            // Head-first edge selection (may include deleted heads) then exclude deleted to avoid resurfacing stale versions.
            // Do not add `deleted_at IS NULL` inside the DISTINCT ON subquery.
            const edgeSql = `SELECT * FROM (
                                SELECT DISTINCT ON (canonical_id) id, type, src_id, dst_id, deleted_at, version
                                FROM kb.graph_relationships
                                WHERE ${dirClauses.join(' AND ')}
                                ORDER BY canonical_id, version DESC
                             ) h
                             WHERE h.deleted_at IS NULL
                             LIMIT 500`;
            const edgeRes = await this.db.query<GraphRelationshipRow>(edgeSql, params);
            for (const e of edgeRes.rows) {
                if (edges.length >= maxEdges) { truncated = true; break; }
                edges.push({ id: e.id, type: e.type, src_id: e.src_id, dst_id: e.dst_id });
                const nextId = e.src_id === current.id ? e.dst_id : e.src_id;
                if (!seen.has(nextId)) queue.push({ id: nextId, depth: current.depth + 1 });
            }
            if (truncated) break;
        }

        return {
            roots: dto.root_ids,
            nodes: Object.entries(nodes).map(([id, v]) => ({ id, ...v })),
            edges,
            truncated,
            max_depth_reached: maxDepthReached
        };
    }
}

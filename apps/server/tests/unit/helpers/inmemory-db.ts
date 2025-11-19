/* In-memory minimal DatabaseService stub for expand tests.
 * Supports subset of SQL patterns used by GraphService.createObject/createRelationship/expand.
 */
import { randomUUID } from 'crypto';

type Row = any;

export class InMemoryDatabaseService {
    objects: Row[] = [];
    relationships: Row[] = [];

    async setTenantContext(orgId: string | null, projectId: string | null) {
        // No-op for tests; expand specs rely on explicit context injection via service parameters.
        // Method is provided to satisfy GraphService's tenant enforcement hook.
        return;
    }

    async runWithTenantContext<T>(projectId: string | null, fn: () => Promise<T>): Promise<T> {
        // In-memory stub: projectId parameter accepted but not used for actual tenant isolation
        // Real implementation derives orgId from projectId automatically
        try {
            return await fn();
        } finally {
            await this.setTenantContext(null, null);
        }
    }

    async onModuleInit() { /* no-op */ }

    getClient() {
        const self = this;
        return Promise.resolve({
            query: (sql: string, params?: any[]) => self.query(sql, params),
            release: () => { /* no-op */ }
        });
    }

    async query<T = any>(sql: string, params: any[] = []): Promise<{ rowCount: number; rows: T[] }> {
        const lowered = sql.toLowerCase().trim();
        // Transaction / locking statements -> no-op
        if (lowered.startsWith('begin') || lowered.startsWith('commit') || lowered.startsWith('rollback') || lowered.includes('pg_advisory_xact_lock')) {
            return { rowCount: 0, rows: [] };
        }
        // DROP INDEX ignore
        if (lowered.startsWith('drop index')) return { rowCount: 0, rows: [] };
        // Insert object
        // After RemoveRedundantOrganizationId migration, parameters are:
        // [type, key, properties, labels, project_id, branch_id, change_summary, content_hash, ...]
        if (lowered.startsWith('insert into kb.graph_objects')) {
            const type = params[0];
            const key = params[1];
            const properties = params[2];
            const labels = params[3];
            const project_id = params[4];
            const branch_id = params[5];
            const change_summary = params[6];
            const content_hash = params[7];
            const row = {
                id: randomUUID(),
                type,
                key,
                properties,
                labels,
                version: 1,
                canonical_id: randomUUID(),
                supersedes_id: null,
                project_id,
                branch_id,
                deleted_at: null,
                change_summary,
                content_hash,
                created_at: new Date().toISOString(),
                status: null
            } as any;
            this.objects.push(row);
            return { rowCount: 1, rows: [row] as any };
        }
        // Select object by id
        if (lowered.includes('from kb.graph_objects where id=$1')) {
            const id = params[0];
            const row = this.objects.find(o => o.id === id);
            return { rowCount: row ? 1 : 0, rows: row ? [row] : [] } as any;
        }
        // Batch object existence query (WHERE id = ANY($1::uuid[]))
        if (lowered.includes('from kb.graph_objects where id = any')) {
            const ids: string[] = params[0] || [];
            const rows = this.objects.filter(o => ids.includes(o.id));
            return { rowCount: rows.length, rows: rows as any };
        }
        // Insert relationship (first creation)
        // After RemoveRedundantOrganizationId migration, parameters are:
        // [project_id, branch_id, type, src_id, dst_id, properties, change_summary, content_hash]
        if (lowered.startsWith('insert into kb.graph_relationships')) {
            const project_id = params[0];
            const branch_id = params[1];
            const type = params[2];
            const src_id = params[3];
            const dst_id = params[4];
            const properties = params[5];
            const version = 1; // always 1 for new relationships
            const canonical_id = randomUUID(); // force unique per relationship for expand tests
            const change_summary = params[6] ?? null;
            const content_hash = params[7] ?? null;
            const row = {
                id: randomUUID(),
                project_id,
                branch_id,
                type,
                src_id,
                dst_id,
                properties,
                version,
                supersedes_id: null,
                canonical_id,
                weight: null,
                valid_from: null,
                valid_to: null,
                deleted_at: null,
                change_summary,
                content_hash,
                created_at: new Date().toISOString()
            } as any;
            this.relationships.push(row);
            return { rowCount: 1, rows: [row] };
        }
        // DISTINCT ON relationship heads (expand traversal)
        if (lowered.includes('from kb.graph_relationships') && lowered.includes('distinct on')) {
            const currentId = params[0];
            // Determine direction clause presence
            let candidates = this.relationships.filter(r => r.src_id === currentId || r.dst_id === currentId);
            // Relationship type filter appears as 'type = any(array[$2,$3,...])' with params appended
            if (lowered.includes('type = any')) {
                const typeParams = params.slice(1); // after currentId
                if (typeParams.length) {
                    const allowed = new Set(typeParams);
                    candidates = candidates.filter(r => allowed.has(r.type));
                }
            }
            // Head selection by canonical_id highest version
            const byCanonical: Record<string, any> = {};
            for (const r of candidates) {
                const existing = byCanonical[r.canonical_id];
                if (!existing || r.version > existing.version) byCanonical[r.canonical_id] = r;
            }
            const rows = Object.values(byCanonical);
            return { rowCount: rows.length, rows: rows as any };
        }
        // relationship head selection for multiplicity check
        if (lowered.includes('from kb.graph_relationships') && lowered.includes('order by version desc') && lowered.includes('limit 1')) {
            // simple lookups by project_id + type + src_id + dst_id
            // Not needed for expand test (no multiplicity constraints triggered) -> return empty
            return { rowCount: 0, rows: [] };
        }
        return { rowCount: 0, rows: [] };
    }
}

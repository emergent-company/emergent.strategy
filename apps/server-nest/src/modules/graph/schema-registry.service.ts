import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import Ajv, { ValidateFunction } from 'ajv';

interface CachedSchema {
    validator: ValidateFunction;
    canonical_id: string;
    version: number;
    project_id: string | null;
    type: string;
}

interface CachedMultiplicity {
    multiplicity: { src: 'one' | 'many'; dst: 'one' | 'many' };
    canonical_id: string;
    version: number;
    project_id: string | null;
    type: string;
}

@Injectable()
export class SchemaRegistryService {
    private ajv = new Ajv({ allErrors: true });
    private objectCache = new Map<string, CachedSchema>(); // key: project|type
    private relationshipCache = new Map<string, CachedSchema>();
    private relationshipMultiplicityCache = new Map<string, CachedMultiplicity>();

    constructor(@Inject(DatabaseService) private readonly db: DatabaseService) { }

    private cacheKey(projectId: string | null, type: string) {
        return `${projectId || 'null'}|${type}`;
    }

    async getObjectValidator(projectId: string | null, type: string): Promise<ValidateFunction | undefined> {
        const key = this.cacheKey(projectId, type);
        const hit = this.objectCache.get(key);
        if (hit) return hit.validator;
        const row = await this.db.query<{ id: string; canonical_id: string; version: number; json_schema: any; project_id: string | null; type: string }>(
            `SELECT id, canonical_id, version, json_schema, project_id, type FROM (
         SELECT DISTINCT ON (canonical_id) *
         FROM kb.object_type_schemas
         WHERE project_id IS NOT DISTINCT FROM $1 AND type = $2
         ORDER BY canonical_id, version DESC
       ) h
       WHERE h.supersedes_id IS NULL
       LIMIT 1`, [projectId, type]
        );
        if (!row.rowCount) return undefined;
        const validator = this.ajv.compile(row.rows[0].json_schema);
        this.objectCache.set(key, { validator, canonical_id: row.rows[0].canonical_id, version: row.rows[0].version, project_id: row.rows[0].project_id, type: row.rows[0].type });
        return validator;
    }

    async getRelationshipValidator(projectId: string | null, type: string): Promise<ValidateFunction | undefined> {
        const key = this.cacheKey(projectId, type);
        const hit = this.relationshipCache.get(key);
        if (hit) return hit.validator;
        const row = await this.db.query<{ id: string; canonical_id: string; version: number; json_schema: any; multiplicity: any; project_id: string | null; type: string }>(
            `SELECT id, canonical_id, version, json_schema, multiplicity, project_id, type FROM (
         SELECT DISTINCT ON (canonical_id) *
         FROM kb.relationship_type_schemas
         WHERE project_id IS NOT DISTINCT FROM $1 AND type = $2
         ORDER BY canonical_id, version DESC
       ) h
       WHERE h.supersedes_id IS NULL
       LIMIT 1`, [projectId, type]
        );
        if (!row.rowCount) return undefined;
        const validator = this.ajv.compile(row.rows[0].json_schema);
        this.relationshipCache.set(key, { validator, canonical_id: row.rows[0].canonical_id, version: row.rows[0].version, project_id: row.rows[0].project_id, type: row.rows[0].type });
        // Populate multiplicity cache opportunistically
        const mult = (row.rows[0].multiplicity as any) || { src: 'many', dst: 'many' };
        this.relationshipMultiplicityCache.set(key, { multiplicity: mult, canonical_id: row.rows[0].canonical_id, version: row.rows[0].version, project_id: row.rows[0].project_id, type: row.rows[0].type });
        return validator;
    }

    async getRelationshipMultiplicity(projectId: string | null, type: string): Promise<{ src: 'one' | 'many'; dst: 'one' | 'many' }> {
        const key = this.cacheKey(projectId, type);
        const hit = this.relationshipMultiplicityCache.get(key);
        if (hit) return hit.multiplicity;
        const row = await this.db.query<{ id: string; canonical_id: string; version: number; multiplicity: any; project_id: string | null; type: string }>(
            `SELECT id, canonical_id, version, multiplicity, project_id, type FROM (
         SELECT DISTINCT ON (canonical_id) *
         FROM kb.relationship_type_schemas
         WHERE project_id IS NOT DISTINCT FROM $1 AND type = $2
         ORDER BY canonical_id, version DESC
       ) h
       WHERE h.supersedes_id IS NULL
       LIMIT 1`, [projectId, type]
        );
        if (!row.rowCount) {
            const def = { src: 'many', dst: 'many' } as const;
            this.relationshipMultiplicityCache.set(key, { multiplicity: def, canonical_id: 'none', version: 0, project_id: projectId, type });
            return def;
        }
        const mult = (row.rows[0].multiplicity as any) || { src: 'many', dst: 'many' };
        this.relationshipMultiplicityCache.set(key, { multiplicity: mult, canonical_id: row.rows[0].canonical_id, version: row.rows[0].version, project_id: row.rows[0].project_id, type: row.rows[0].type });
        return mult;
    }
}

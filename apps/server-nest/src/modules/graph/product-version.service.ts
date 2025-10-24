import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { CreateProductVersionDto } from './dto/create-product-version.dto';

export interface ProductVersionRow {
  id: string; organization_id: string | null; project_id: string; name: string; description: string | null; base_product_version_id: string | null; created_at: string;
}
export interface ProductVersionMemberRow { product_version_id: string; object_canonical_id: string; object_version_id: string; created_at: string }

@Injectable()
export class ProductVersionService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) { }

  /**
   * Create an immutable product version (release snapshot) capturing the current head
   * version of every canonical object in the project (across all branches). For each
   * canonical_id we select the max(version) where deleted_at IS NULL.
   */
  async create(projectId: string, orgId: string | null, dto: CreateProductVersionDto): Promise<{ id: string; name: string; description: string | null; created_at: string; member_count: number; base_product_version_id: string | null; }> {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('name_required');
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      // Serialize by logical identity (project + lower(name))
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`product_version|${projectId}|${name.toLowerCase()}`]);
      const existing = await client.query<{ id: string }>(`SELECT id FROM kb.product_versions WHERE project_id=$1 AND LOWER(name)=LOWER($2) LIMIT 1`, [projectId, name]);
      if (existing.rowCount) throw new BadRequestException('product_version_name_exists');
      let baseId: string | null = null;
      if (dto.base_product_version_id) {
        const base = await client.query<{ id: string }>(`SELECT id FROM kb.product_versions WHERE id=$1 AND project_id=$2`, [dto.base_product_version_id, projectId]);
        if (!base.rowCount) throw new NotFoundException('base_product_version_not_found');
        baseId = base.rows[0].id;
      }
      const inserted = await client.query<ProductVersionRow>(
        `INSERT INTO kb.product_versions(project_id, organization_id, name, description, base_product_version_id)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, organization_id, project_id, name, description, base_product_version_id, created_at`,
        [projectId, orgId, name, dto.description ?? null, baseId]
      );
      const pv = inserted.rows[0];
      // Enumerate latest object versions per canonical (project scope, excluding deleted)
      const heads = await client.query<{ canonical_id: string; id: string }>(
        `SELECT DISTINCT ON (canonical_id) canonical_id, id
         FROM kb.graph_objects
         WHERE project_id = $1 AND deleted_at IS NULL
         ORDER BY canonical_id, version DESC`, [projectId]
      );
      if (heads.rowCount) {
        // Bulk insert membership (avoid ON CONFLICT due to enforced PK uniqueness)
        const values: string[] = [];
        const params: any[] = [];
        heads.rows.forEach((r, idx) => {
          const base = idx * 3;
          values.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
          params.push(pv.id, r.canonical_id, r.id);
        });
        await client.query(
          `INSERT INTO kb.product_version_members(product_version_id, object_canonical_id, object_version_id)
           VALUES ${values.join(',')}`,
          params
        );
      }
      await client.query('COMMIT');
      return { id: pv.id, name: pv.name, description: pv.description, created_at: pv.created_at, member_count: heads.rowCount as number, base_product_version_id: pv.base_product_version_id };
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    } finally { client.release(); }
  }

  async get(projectId: string, id: string): Promise<{ id: string; name: string; description: string | null; created_at: string; member_count: number; base_product_version_id: string | null; } | null> {
    const row = await this.db.query<ProductVersionRow>(`SELECT id, project_id, name, description, base_product_version_id, created_at FROM kb.product_versions WHERE id=$1 AND project_id=$2`, [id, projectId]);
    if (!row.rowCount) return null;
    const count = await this.db.query<{ c: number }>(`SELECT COUNT(*)::int as c FROM kb.product_version_members WHERE product_version_id=$1`, [id]);
    return { id: row.rows[0].id, name: row.rows[0].name, description: row.rows[0].description, created_at: row.rows[0].created_at, member_count: count.rows[0].c, base_product_version_id: row.rows[0].base_product_version_id };
  }

  /**
   * List product versions for a project with pagination.
   * Returns versions sorted by created_at DESC (newest first).
   */
  async list(
    projectId: string,
    options: { limit?: number; cursor?: string } = {}
  ): Promise<{
    items: Array<{ id: string; name: string; description: string | null; created_at: string; member_count: number; base_product_version_id: string | null; }>;
    next_cursor?: string;
  }> {
    const limit = options.limit && options.limit > 0 && options.limit <= 100 ? options.limit : 20;
    const params: any[] = [projectId];
    let cursorClause = '';

    if (options.cursor) {
      // Cursor is the created_at timestamp of the last item
      params.push(options.cursor);
      cursorClause = ` AND created_at < $${params.length}`;
    }

    // Fetch limit + 1 to determine if there's a next page
    params.push(limit + 1);
    const rows = await this.db.query<ProductVersionRow>(
      `SELECT id, project_id, name, description, base_product_version_id, created_at
       FROM kb.product_versions
       WHERE project_id = $1${cursorClause}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    );

    let items = rows.rows;
    let next_cursor: string | undefined;

    if (items.length > limit) {
      // More results exist
      next_cursor = items[limit - 1].created_at;
      items = items.slice(0, limit);
    }

    // Fetch member counts for all returned versions
    const results: Array<{ id: string; name: string; description: string | null; created_at: string; member_count: number; base_product_version_id: string | null; }> = [];

    for (const item of items) {
      const count = await this.db.query<{ c: number }>(
        `SELECT COUNT(*)::int as c FROM kb.product_version_members WHERE product_version_id=$1`,
        [item.id]
      );
      results.push({
        id: item.id,
        name: item.name,
        description: item.description,
        created_at: item.created_at,
        member_count: count.rows[0].c,
        base_product_version_id: item.base_product_version_id,
      });
    }

    return { items: results, next_cursor };
  }

  /**
   * Diff two product versions (releases).
   * Returns the canonical objects that were added, removed, modified, or unchanged
   * between two releases. Per spec Section 5.6.3.
   * 
   * @param projectId Project ID for scoping
   * @param versionAId First version ID
   * @param versionBId Second version ID (compared against A)
   * @returns Diff summary with change_type for each canonical object
   */
  async diffReleases(
    projectId: string,
    versionAId: string,
    versionBId: string
  ): Promise<{
    items: Array<{
      canonical_id: string;
      change_type: 'added' | 'removed' | 'modified' | 'unchanged';
      version_a_object_id: string | null;
      version_b_object_id: string | null;
    }>;
    meta: {
      added: number;
      removed: number;
      modified: number;
      unchanged: number;
    };
  }> {
    // Verify both versions exist and belong to the project
    const versionA = await this.db.query<ProductVersionRow>(
      `SELECT id FROM kb.product_versions WHERE id=$1 AND project_id=$2`,
      [versionAId, projectId]
    );
    const versionB = await this.db.query<ProductVersionRow>(
      `SELECT id FROM kb.product_versions WHERE id=$1 AND project_id=$2`,
      [versionBId, projectId]
    );

    if (!versionA.rowCount) throw new NotFoundException('version_a_not_found');
    if (!versionB.rowCount) throw new NotFoundException('version_b_not_found');

    // Perform FULL OUTER JOIN diff per spec Section 5.6.3
    const rows = await this.db.query<{
      canonical_id: string;
      release_a_object: string | null;
      release_b_object: string | null;
      change_type: 'added' | 'removed' | 'modified' | 'unchanged';
    }>(
      `SELECT COALESCE(a.object_canonical_id, b.object_canonical_id) AS canonical_id,
              a.object_version_id AS release_a_object,
              b.object_version_id AS release_b_object,
              CASE
                WHEN a.object_version_id IS NULL THEN 'added'
                WHEN b.object_version_id IS NULL THEN 'removed'
                WHEN a.object_version_id <> b.object_version_id THEN 'modified'
                ELSE 'unchanged'
              END AS change_type
       FROM (
         SELECT object_canonical_id, object_version_id 
         FROM kb.product_version_members 
         WHERE product_version_id = $1
       ) a
       FULL OUTER JOIN (
         SELECT object_canonical_id, object_version_id 
         FROM kb.product_version_members 
         WHERE product_version_id = $2
       ) b USING (object_canonical_id)
       ORDER BY canonical_id`,
      [versionAId, versionBId]
    );

    // Compute metadata counts
    const meta = {
      added: 0,
      removed: 0,
      modified: 0,
      unchanged: 0,
    };

    const items = rows.rows.map(row => {
      meta[row.change_type]++;
      return {
        canonical_id: row.canonical_id,
        change_type: row.change_type,
        version_a_object_id: row.release_a_object,
        version_b_object_id: row.release_b_object,
      };
    });

    return { items, meta };
  }
}

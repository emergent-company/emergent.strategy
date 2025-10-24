import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

export interface TagRow {
    id: string;
    organization_id: string | null;
    project_id: string;
    product_version_id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
}

export interface TagDto {
    id: string;
    organization_id: string | null;
    project_id: string;
    product_version_id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
}

@Injectable()
export class TagService {
    constructor(@Inject(DatabaseService) private readonly db: DatabaseService) { }

    /**
     * Create a new tag pointing to a product version.
     * Per spec Section 5.8: Tags simply reference product_version_id.
     * Tag names are unique within project scope.
     */
    async create(projectId: string, orgId: string | null, dto: CreateTagDto): Promise<TagDto> {
        const name = dto.name.trim();
        if (!name) throw new BadRequestException('name_required');

        const client = await this.db.getClient();
        try {
            await client.query('BEGIN');

            // Serialize by logical identity (project + lower(name))
            await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [
                `tag|${projectId}|${name.toLowerCase()}`,
            ]);

            // Check if tag name already exists in project
            const existing = await client.query<{ id: string }>(
                `SELECT id FROM kb.tags WHERE project_id=$1 AND LOWER(name)=LOWER($2) LIMIT 1`,
                [projectId, name]
            );
            if (existing.rowCount) throw new BadRequestException('tag_name_exists');

            // Verify product version exists and belongs to project
            const version = await client.query<{ id: string }>(
                `SELECT id FROM kb.product_versions WHERE id=$1 AND project_id=$2`,
                [dto.product_version_id, projectId]
            );
            if (!version.rowCount) throw new NotFoundException('product_version_not_found');

            // Insert tag
            const res = await this.db.query<TagRow>(
                `INSERT INTO kb.tags(project_id, organization_id, product_version_id, name, description)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, organization_id, project_id, product_version_id, name, description, created_at, updated_at`,
                [projectId, orgId, dto.product_version_id, dto.name, dto.description || null],
            );

            await client.query('COMMIT');
            return res.rows[0];
        } catch (e) {
            try {
                await client.query('ROLLBACK');
            } catch {
                /* ignore */
            }
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * List all tags for a project with optional pagination.
     */
    async list(
        projectId: string,
        options: { limit?: number; cursor?: string } = {}
    ): Promise<{ items: TagDto[]; next_cursor?: string }> {
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
        const rows = await this.db.query<TagRow>(
            `SELECT id, organization_id, project_id, product_version_id, name, description, created_at, updated_at
       FROM kb.tags
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

        return { items, next_cursor };
    }

    /**
     * Get a specific tag by ID.
     */
    async get(projectId: string, id: string): Promise<TagDto | null> {
        const row = await this.db.query<TagRow>(
            `SELECT id, organization_id, project_id, product_version_id, name, description, created_at, updated_at
       FROM kb.tags
       WHERE id=$1 AND project_id=$2`,
            [id, projectId]
        );
        if (!row.rowCount) return null;
        return row.rows[0];
    }

    /**
     * Get a tag by name within a project.
     */
    async getByName(projectId: string, name: string): Promise<TagDto | null> {
        const row = await this.db.query<TagRow>(
            `SELECT id, organization_id, project_id, product_version_id, name, description, created_at, updated_at
       FROM kb.tags
       WHERE project_id=$1 AND LOWER(name)=LOWER($2)`,
            [projectId, name]
        );
        if (!row.rowCount) return null;
        return row.rows[0];
    }

    /**
     * Update a tag (currently only description can be updated).
     * Per spec: Retagging a name is forbidden unless explicitly deleted.
     */
    async update(projectId: string, id: string, dto: UpdateTagDto): Promise<TagDto> {
        const client = await this.db.getClient();
        try {
            await client.query('BEGIN');

            const existing = await client.query<TagRow>(
                `SELECT id FROM kb.tags WHERE id=$1 AND project_id=$2`,
                [id, projectId]
            );
            if (!existing.rowCount) throw new NotFoundException('tag_not_found');

            const updated = await client.query<TagRow>(
                `UPDATE kb.tags
         SET description=$1, updated_at=now()
         WHERE id=$2 AND project_id=$3
         RETURNING id, organization_id, project_id, product_version_id, name, description, created_at, updated_at`,
                [dto.description ?? null, id, projectId]
            );

            await client.query('COMMIT');
            return updated.rows[0];
        } catch (e) {
            try {
                await client.query('ROLLBACK');
            } catch {
                /* ignore */
            }
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Delete a tag.
     * Per spec: Deleting a tag does not affect the product version snapshot.
     */
    async delete(projectId: string, id: string): Promise<void> {
        const result = await this.db.query(
            `DELETE FROM kb.tags WHERE id=$1 AND project_id=$2`,
            [id, projectId]
        );
        if (!result.rowCount) throw new NotFoundException('tag_not_found');
    }
}

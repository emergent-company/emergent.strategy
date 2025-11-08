import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DatabaseService } from '../../common/database/database.service';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';
import { Tag } from '../../entities/tag.entity';
import { ProductVersion } from '../../entities/product-version.entity';

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
    constructor(
        @InjectRepository(Tag) private readonly tagRepository: Repository<Tag>,
        @InjectRepository(ProductVersion) private readonly productVersionRepository: Repository<ProductVersion>,
        private readonly dataSource: DataSource,
        @Inject(DatabaseService) private readonly db: DatabaseService
    ) { }

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

            // Insert tag using TypeORM
            const tag = this.tagRepository.create({
                projectId,
                organizationId: orgId,
                productVersionId: dto.product_version_id,
                name: dto.name,
                description: dto.description || null
            });
            
            const savedTag = await this.tagRepository.save(tag);

            await client.query('COMMIT');
            return {
                id: savedTag.id,
                organization_id: savedTag.organizationId,
                project_id: savedTag.projectId,
                product_version_id: savedTag.productVersionId,
                name: savedTag.name,
                description: savedTag.description,
                created_at: savedTag.createdAt.toISOString(),
                updated_at: savedTag.updatedAt.toISOString()
            };
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
        
        const queryBuilder = this.tagRepository
            .createQueryBuilder('tag')
            .where('tag.project_id = :projectId', { projectId })
            .orderBy('tag.created_at', 'DESC')
            .take(limit + 1);

        if (options.cursor) {
            queryBuilder.andWhere('tag.created_at < :cursor', { cursor: options.cursor });
        }

        const tags = await queryBuilder.getMany();
        let next_cursor: string | undefined;

        if (tags.length > limit) {
            // More results exist
            next_cursor = tags[limit - 1].createdAt.toISOString();
            tags.splice(limit); // Remove the extra item
        }

        const items: TagDto[] = tags.map(t => ({
            id: t.id,
            organization_id: t.organizationId,
            project_id: t.projectId,
            product_version_id: t.productVersionId,
            name: t.name,
            description: t.description,
            created_at: t.createdAt.toISOString(),
            updated_at: t.updatedAt.toISOString()
        }));

        return { items, next_cursor };
    }

    /**
     * Get a specific tag by ID.
     */
    async get(projectId: string, id: string): Promise<TagDto | null> {
        const tag = await this.tagRepository.findOne({
            where: { id, projectId }
        });
        if (!tag) return null;
        
        return {
            id: tag.id,
            organization_id: tag.organizationId,
            project_id: tag.projectId,
            product_version_id: tag.productVersionId,
            name: tag.name,
            description: tag.description,
            created_at: tag.createdAt.toISOString(),
            updated_at: tag.updatedAt.toISOString()
        };
    }

    /**
     * Get a tag by name within a project (case-insensitive).
     */
    async getByName(projectId: string, name: string): Promise<TagDto | null> {
        const tag = await this.tagRepository
            .createQueryBuilder('tag')
            .where('tag.project_id = :projectId', { projectId })
            .andWhere('LOWER(tag.name) = LOWER(:name)', { name })
            .getOne();
            
        if (!tag) return null;
        
        return {
            id: tag.id,
            organization_id: tag.organizationId,
            project_id: tag.projectId,
            product_version_id: tag.productVersionId,
            name: tag.name,
            description: tag.description,
            created_at: tag.createdAt.toISOString(),
            updated_at: tag.updatedAt.toISOString()
        };
    }

    /**
     * Update a tag (currently only description can be updated).
     * Per spec: Retagging a name is forbidden unless explicitly deleted.
     */
    async update(projectId: string, id: string, dto: UpdateTagDto): Promise<TagDto> {
        const tag = await this.tagRepository.findOne({
            where: { id, projectId }
        });
        
        if (!tag) throw new NotFoundException('tag_not_found');

        tag.description = dto.description ?? null;
        const updated = await this.tagRepository.save(tag);

        return {
            id: updated.id,
            organization_id: updated.organizationId,
            project_id: updated.projectId,
            product_version_id: updated.productVersionId,
            name: updated.name,
            description: updated.description,
            created_at: updated.createdAt.toISOString(),
            updated_at: updated.updatedAt.toISOString()
        };
    }

    /**
     * Delete a tag.
     * Per spec: Deleting a tag does not affect the product version snapshot.
     */
    async delete(projectId: string, id: string): Promise<void> {
        const result = await this.tagRepository.delete({ id, projectId });
        if (!result.affected || result.affected === 0) {
            throw new NotFoundException('tag_not_found');
        }
    }
}

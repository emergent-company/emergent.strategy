import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { EmbeddingPolicy, EmbeddingPolicyRow, toEmbeddingPolicy } from './embedding-policy.entity';
import { CreateEmbeddingPolicyDto, UpdateEmbeddingPolicyDto } from './embedding-policy.dto';

/**
 * Service for managing and evaluating embedding policies
 */
@Injectable()
export class EmbeddingPolicyService {
    private readonly logger = new Logger(EmbeddingPolicyService.name);

    constructor(private readonly db: DatabaseService) { }

    /**
     * Create a new embedding policy
     */
    async create(projectId: string, dto: CreateEmbeddingPolicyDto): Promise<EmbeddingPolicy> {
        const result = await this.db.query<EmbeddingPolicyRow>(
            `INSERT INTO kb.embedding_policies 
             (project_id, object_type, enabled, max_property_size, required_labels, excluded_labels, relevant_paths, excluded_statuses)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING *`,
            [
                projectId,
                dto.objectType,
                dto.enabled ?? true,
                dto.maxPropertySize ?? null,
                dto.requiredLabels ?? [],
                dto.excludedLabels ?? [],
                dto.relevantPaths ?? [],
                dto.excludedStatuses ?? [],
            ]
        );

        return toEmbeddingPolicy(result.rows[0]);
    }

    /**
     * Find all policies for a project
     */
    async findByProject(projectId: string): Promise<EmbeddingPolicy[]> {
        const result = await this.db.query<EmbeddingPolicyRow>(
            'SELECT * FROM kb.embedding_policies WHERE project_id = $1 ORDER BY object_type ASC',
            [projectId]
        );

        return result.rows.map(toEmbeddingPolicy);
    }

    /**
     * Find policy by ID
     */
    async findById(id: string, projectId: string): Promise<EmbeddingPolicy | null> {
        const result = await this.db.query<EmbeddingPolicyRow>(
            'SELECT * FROM kb.embedding_policies WHERE id = $1 AND project_id = $2',
            [id, projectId]
        );

        return result.rows[0] ? toEmbeddingPolicy(result.rows[0]) : null;
    }

    /**
     * Find policy by object type
     */
    async findByType(projectId: string, objectType: string): Promise<EmbeddingPolicy | null> {
        const result = await this.db.query<EmbeddingPolicyRow>(
            'SELECT * FROM kb.embedding_policies WHERE project_id = $1 AND object_type = $2',
            [projectId, objectType]
        );

        return result.rows[0] ? toEmbeddingPolicy(result.rows[0]) : null;
    }

    /**
     * Update an existing policy
     */
    async update(id: string, projectId: string, dto: UpdateEmbeddingPolicyDto): Promise<EmbeddingPolicy | null> {
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (dto.enabled !== undefined) {
            updates.push(`enabled = $${paramIndex++}`);
            values.push(dto.enabled);
        }
        if (dto.maxPropertySize !== undefined) {
            updates.push(`max_property_size = $${paramIndex++}`);
            values.push(dto.maxPropertySize);
        }
        if (dto.requiredLabels !== undefined) {
            updates.push(`required_labels = $${paramIndex++}`);
            values.push(dto.requiredLabels);
        }
        if (dto.excludedLabels !== undefined) {
            updates.push(`excluded_labels = $${paramIndex++}`);
            values.push(dto.excludedLabels);
        }
        if (dto.relevantPaths !== undefined) {
            updates.push(`relevant_paths = $${paramIndex++}`);
            values.push(dto.relevantPaths);
        }
        if (dto.excludedStatuses !== undefined) {
            updates.push(`excluded_statuses = $${paramIndex++}`);
            values.push(dto.excludedStatuses);
        }

        if (updates.length === 0) {
            return this.findById(id, projectId);
        }

        updates.push(`updated_at = now()`);
        values.push(id, projectId);

        const result = await this.db.query<EmbeddingPolicyRow>(
            `UPDATE kb.embedding_policies 
             SET ${updates.join(', ')}
             WHERE id = $${paramIndex} AND project_id = $${paramIndex + 1}
             RETURNING *`,
            values
        );

        return result.rows[0] ? toEmbeddingPolicy(result.rows[0]) : null;
    }

    /**
     * Delete a policy
     */
    async delete(id: string, projectId: string): Promise<boolean> {
        const result = await this.db.query(
            'DELETE FROM kb.embedding_policies WHERE id = $1 AND project_id = $2',
            [id, projectId]
        );

        return result.rowCount! > 0;
    }

    /**
     * Evaluate whether an object should be embedded based on policies
     * 
     * @param objectType - Type of the object
     * @param properties - Object properties (JSONB)
     * @param labels - Object labels
     * @param policies - Policies to evaluate (typically all policies for the project)
     * @param status - Object status (optional)
     * @returns true if object should be embedded, false otherwise
     */
    shouldEmbed(
        objectType: string,
        properties: Record<string, any>,
        labels: string[],
        policies: EmbeddingPolicy[],
        status?: string | null
    ): { shouldEmbed: boolean; reason?: string; filteredProperties?: Record<string, any> } {
        // Find policy for this object type
        const policy = policies.find(p => p.objectType === objectType);

        // If no policy exists, default to embedding (permissive)
        if (!policy) {
            return { shouldEmbed: true };
        }

        // Check 1: Is embedding enabled for this type?
        if (!policy.enabled) {
            return { shouldEmbed: false, reason: 'Embedding disabled for this object type' };
        }

        // Check 2: Property size limit
        if (policy.maxPropertySize !== null) {
            const propertiesJson = JSON.stringify(properties);
            const size = Buffer.byteLength(propertiesJson, 'utf8');

            if (size > policy.maxPropertySize) {
                return {
                    shouldEmbed: false,
                    reason: `Properties size (${size} bytes) exceeds limit (${policy.maxPropertySize} bytes)`,
                };
            }
        }

        // Check 3: Required labels
        if (policy.requiredLabels.length > 0) {
            const hasAllRequired = policy.requiredLabels.every(reqLabel =>
                labels.some(objLabel => objLabel === reqLabel)
            );

            if (!hasAllRequired) {
                return {
                    shouldEmbed: false,
                    reason: `Missing required labels: ${policy.requiredLabels.join(', ')}`,
                };
            }
        }

        // Check 4: Excluded labels
        if (policy.excludedLabels.length > 0) {
            const hasExcluded = policy.excludedLabels.some(excLabel =>
                labels.some(objLabel => objLabel === excLabel)
            );

            if (hasExcluded) {
                const excludedFound = policy.excludedLabels.filter(excLabel =>
                    labels.some(objLabel => objLabel === excLabel)
                );
                return {
                    shouldEmbed: false,
                    reason: `Has excluded labels: ${excludedFound.join(', ')}`,
                };
            }
        }

        // Check 5: Excluded statuses
        if (policy.excludedStatuses.length > 0 && status) {
            const isExcluded = policy.excludedStatuses.some(excStatus =>
                excStatus.toLowerCase() === status.toLowerCase()
            );

            if (isExcluded) {
                return {
                    shouldEmbed: false,
                    reason: `Object has excluded status: ${status}`,
                };
            }
        }

        // Check 6: Relevant paths (field masking)
        let filteredProperties = properties;
        if (policy.relevantPaths.length > 0) {
            filteredProperties = this.filterPropertiesByPaths(properties, policy.relevantPaths);

            // If no data remains after filtering, don't embed
            if (Object.keys(filteredProperties).length === 0) {
                return {
                    shouldEmbed: false,
                    reason: 'No relevant properties found after path filtering',
                };
            }
        }

        return {
            shouldEmbed: true,
            filteredProperties: policy.relevantPaths.length > 0 ? filteredProperties : undefined,
        };
    }

    /**
     * Filter properties to only include specified JSON Pointer paths
     * 
     * @param properties - Full properties object
     * @param paths - JSON Pointer paths (e.g., "/properties/title", "/metadata/author")
     * @returns Filtered properties object
     */
    private filterPropertiesByPaths(
        properties: Record<string, any>,
        paths: string[]
    ): Record<string, any> {
        const filtered: Record<string, any> = {};

        for (const path of paths) {
            try {
                // JSON Pointer format: "/properties/title" -> gets properties.title
                if (this.hasPath(properties, path)) {
                    const value = this.getPath(properties, path);

                    // Reconstruct the nested structure
                    this.setNestedPath(filtered, path, value);
                }
            } catch (error) {
                this.logger.warn(`Failed to extract path ${path}: ${(error as Error).message}`);
            }
        }

        return filtered;
    }

    /**
     * Check if a JSON Pointer path exists in an object
     */
    private hasPath(obj: Record<string, any>, path: string): boolean {
        const parts = path.split('/').filter(p => p !== '');
        let current: any = obj;

        for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            } else {
                return false;
            }
        }

        return true;
    }

    /**
     * Get value at a JSON Pointer path
     */
    private getPath(obj: Record<string, any>, path: string): any {
        const parts = path.split('/').filter(p => p !== '');
        let current: any = obj;

        for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            } else {
                return undefined;
            }
        }

        return current;
    }

    /**
     * Set a nested property using a JSON Pointer path
     * 
     * @param obj - Target object
     * @param path - JSON Pointer path
     * @param value - Value to set
     */
    private setNestedPath(obj: Record<string, any>, path: string, value: any): void {
        const parts = path.split('/').filter(p => p !== '');

        let current = obj;
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!(part in current)) {
                current[part] = {};
            }
            current = current[part];
        }

        const lastPart = parts[parts.length - 1];
        current[lastPart] = value;
    }

    /**
     * Batch evaluate multiple objects
     * Useful for filtering a list of objects before queueing embedding jobs
     */
    async batchShouldEmbed(
        projectId: string,
        objects: Array<{ type: string; properties: Record<string, any>; labels: string[]; status?: string | null }>
    ): Promise<Array<{ shouldEmbed: boolean; reason?: string; filteredProperties?: Record<string, any> }>> {
        const policies = await this.findByProject(projectId);

        return objects.map(obj =>
            this.shouldEmbed(obj.type, obj.properties, obj.labels, policies, obj.status)
        );
    }
}

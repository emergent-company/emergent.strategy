import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  EmbeddingPolicy as EmbeddingPolicyInterface,
  EmbeddingPolicyRow,
  toEmbeddingPolicy,
} from './embedding-policy.entity';
import {
  CreateEmbeddingPolicyDto,
  UpdateEmbeddingPolicyDto,
} from './embedding-policy.dto';
import { EmbeddingPolicy } from '../../entities/embedding-policy.entity';

/**
 * Service for managing and evaluating embedding policies
 */
@Injectable()
export class EmbeddingPolicyService {
  private readonly logger = new Logger(EmbeddingPolicyService.name);

  constructor(
    @InjectRepository(EmbeddingPolicy)
    private readonly embeddingPolicyRepository: Repository<EmbeddingPolicy>
  ) {}

  /**
   * Create a new embedding policy
   */
  async create(
    projectId: string,
    dto: CreateEmbeddingPolicyDto
  ): Promise<EmbeddingPolicyInterface> {
    const policy = this.embeddingPolicyRepository.create({
      projectId,
      objectType: dto.objectType,
      enabled: dto.enabled ?? true,
      maxPropertySize: dto.maxPropertySize ?? null,
      requiredLabels: dto.requiredLabels ?? [],
      excludedLabels: dto.excludedLabels ?? [],
      relevantPaths: dto.relevantPaths ?? [],
      excludedStatuses: dto.excludedStatuses ?? [],
    });

    const saved = await this.embeddingPolicyRepository.save(policy);

    return {
      id: saved.id,
      projectId: saved.projectId,
      objectType: saved.objectType,
      enabled: saved.enabled,
      maxPropertySize: saved.maxPropertySize,
      requiredLabels: saved.requiredLabels,
      excludedLabels: saved.excludedLabels,
      relevantPaths: saved.relevantPaths,
      excludedStatuses: saved.excludedStatuses,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }

  /**
   * Find all policies for a project
   */
  async findByProject(projectId: string): Promise<EmbeddingPolicyInterface[]> {
    const policies = await this.embeddingPolicyRepository.find({
      where: { projectId },
      order: { objectType: 'ASC' },
    });

    return policies.map((p) => ({
      id: p.id,
      projectId: p.projectId,
      objectType: p.objectType,
      enabled: p.enabled,
      maxPropertySize: p.maxPropertySize,
      requiredLabels: p.requiredLabels,
      excludedLabels: p.excludedLabels,
      relevantPaths: p.relevantPaths,
      excludedStatuses: p.excludedStatuses,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  /**
   * Find policy by ID
   */
  async findById(
    id: string,
    projectId: string
  ): Promise<EmbeddingPolicyInterface | null> {
    const policy = await this.embeddingPolicyRepository.findOne({
      where: { id, projectId },
    });

    if (!policy) return null;

    return {
      id: policy.id,
      projectId: policy.projectId,
      objectType: policy.objectType,
      enabled: policy.enabled,
      maxPropertySize: policy.maxPropertySize,
      requiredLabels: policy.requiredLabels,
      excludedLabels: policy.excludedLabels,
      relevantPaths: policy.relevantPaths,
      excludedStatuses: policy.excludedStatuses,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    };
  }

  /**
   * Find policy by object type
   */
  async findByType(
    projectId: string,
    objectType: string
  ): Promise<EmbeddingPolicyInterface | null> {
    const policy = await this.embeddingPolicyRepository.findOne({
      where: { projectId, objectType },
    });

    if (!policy) return null;

    return {
      id: policy.id,
      projectId: policy.projectId,
      objectType: policy.objectType,
      enabled: policy.enabled,
      maxPropertySize: policy.maxPropertySize,
      requiredLabels: policy.requiredLabels,
      excludedLabels: policy.excludedLabels,
      relevantPaths: policy.relevantPaths,
      excludedStatuses: policy.excludedStatuses,
      createdAt: policy.createdAt,
      updatedAt: policy.updatedAt,
    };
  }

  /**
   * Update an existing policy
   */
  async update(
    id: string,
    projectId: string,
    dto: UpdateEmbeddingPolicyDto
  ): Promise<EmbeddingPolicyInterface | null> {
    const policy = await this.embeddingPolicyRepository.findOne({
      where: { id, projectId },
    });

    if (!policy) return null;

    // Apply updates
    if (dto.enabled !== undefined) policy.enabled = dto.enabled;
    if (dto.maxPropertySize !== undefined)
      policy.maxPropertySize = dto.maxPropertySize;
    if (dto.requiredLabels !== undefined)
      policy.requiredLabels = dto.requiredLabels;
    if (dto.excludedLabels !== undefined)
      policy.excludedLabels = dto.excludedLabels;
    if (dto.relevantPaths !== undefined)
      policy.relevantPaths = dto.relevantPaths;
    if (dto.excludedStatuses !== undefined)
      policy.excludedStatuses = dto.excludedStatuses;

    const saved = await this.embeddingPolicyRepository.save(policy);

    return {
      id: saved.id,
      projectId: saved.projectId,
      objectType: saved.objectType,
      enabled: saved.enabled,
      maxPropertySize: saved.maxPropertySize,
      requiredLabels: saved.requiredLabels,
      excludedLabels: saved.excludedLabels,
      relevantPaths: saved.relevantPaths,
      excludedStatuses: saved.excludedStatuses,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt,
    };
  }

  /**
   * Delete a policy
   */
  async delete(id: string, projectId: string): Promise<boolean> {
    const result = await this.embeddingPolicyRepository.delete({
      id,
      projectId,
    });

    return (result.affected ?? 0) > 0;
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
    policies: EmbeddingPolicyInterface[],
    status?: string | null
  ): {
    shouldEmbed: boolean;
    reason?: string;
    filteredProperties?: Record<string, any>;
  } {
    // Find policy for this object type
    const policy = policies.find((p) => p.objectType === objectType);

    // If no policy exists, default to embedding (permissive)
    if (!policy) {
      return { shouldEmbed: true };
    }

    // Check 1: Is embedding enabled for this type?
    if (!policy.enabled) {
      return {
        shouldEmbed: false,
        reason: 'Embedding disabled for this object type',
      };
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
      const hasAllRequired = policy.requiredLabels.every((reqLabel) =>
        labels.some((objLabel) => objLabel === reqLabel)
      );

      if (!hasAllRequired) {
        return {
          shouldEmbed: false,
          reason: `Missing required labels: ${policy.requiredLabels.join(
            ', '
          )}`,
        };
      }
    }

    // Check 4: Excluded labels
    if (policy.excludedLabels.length > 0) {
      const hasExcluded = policy.excludedLabels.some((excLabel) =>
        labels.some((objLabel) => objLabel === excLabel)
      );

      if (hasExcluded) {
        const excludedFound = policy.excludedLabels.filter((excLabel) =>
          labels.some((objLabel) => objLabel === excLabel)
        );
        return {
          shouldEmbed: false,
          reason: `Has excluded labels: ${excludedFound.join(', ')}`,
        };
      }
    }

    // Check 5: Excluded statuses
    if (policy.excludedStatuses.length > 0 && status) {
      const isExcluded = policy.excludedStatuses.some(
        (excStatus) => excStatus.toLowerCase() === status.toLowerCase()
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
      filteredProperties = this.filterPropertiesByPaths(
        properties,
        policy.relevantPaths
      );

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
      filteredProperties:
        policy.relevantPaths.length > 0 ? filteredProperties : undefined,
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
        this.logger.warn(
          `Failed to extract path ${path}: ${(error as Error).message}`
        );
      }
    }

    return filtered;
  }

  /**
   * Check if a JSON Pointer path exists in an object
   */
  private hasPath(obj: Record<string, any>, path: string): boolean {
    const parts = path.split('/').filter((p) => p !== '');
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
    const parts = path.split('/').filter((p) => p !== '');
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
  private setNestedPath(
    obj: Record<string, any>,
    path: string,
    value: any
  ): void {
    const parts = path.split('/').filter((p) => p !== '');

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
    objects: Array<{
      type: string;
      properties: Record<string, any>;
      labels: string[];
      status?: string | null;
    }>
  ): Promise<
    Array<{
      shouldEmbed: boolean;
      reason?: string;
      filteredProperties?: Record<string, any>;
    }>
  > {
    const policies = await this.findByProject(projectId);

    return objects.map((obj) =>
      this.shouldEmbed(
        obj.type,
        obj.properties,
        obj.labels,
        policies,
        obj.status
      )
    );
  }
}

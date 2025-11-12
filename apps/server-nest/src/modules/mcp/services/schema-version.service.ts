import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { TemplatePackService } from '../../template-packs/template-pack.service';

/**
 * Schema Version Service
 *
 * Manages schema versioning for MCP tools to enable cache invalidation.
 *
 * The schema version is a hash computed from all template packs in the system.
 * Any change to template packs (add, update, delete) produces a new version,
 * signaling to AI agents that cached results may be stale.
 *
 * Strategy:
 * - Fetch all template packs with their metadata
 * - Create composite string: id1:updated_at1|id2:updated_at2|...
 * - Compute MD5 hash of composite string
 * - Cache result for 60 seconds to avoid repeated DB queries
 *
 * This approach detects:
 * - Template pack additions (new ID in composite)
 * - Template pack updates (changed updated_at)
 * - Template pack deletions (missing ID from composite)
 */
@Injectable()
export class SchemaVersionService {
  private cachedVersion: string | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL_MS = 60 * 1000; // 60 seconds

  constructor(private readonly templatePackService: TemplatePackService) {}

  /**
   * Get current schema version hash
   *
   * Returns a stable hash that changes whenever template packs are modified.
   * Results are cached for 60 seconds to minimize database load.
   *
   * @returns MD5 hash representing current schema state
   */
  async getSchemaVersion(): Promise<string> {
    // Return cached version if still valid
    if (this.cachedVersion && Date.now() < this.cacheExpiry) {
      return this.cachedVersion;
    }

    // Fetch all template packs
    const result = await this.templatePackService.listTemplatePacks({
      limit: 1000, // High limit to get all packs
      page: 1,
    });

    // Sort by ID for stable ordering
    const sortedPacks = [...result.packs].sort((a, b) =>
      a.id.localeCompare(b.id)
    );

    // Create composite string: id1:timestamp1|id2:timestamp2|...
    const composite = sortedPacks
      .map((pack) => {
        const timestamp = new Date(pack.updated_at).getTime();
        return `${pack.id}:${timestamp}`;
      })
      .join('|');

    // Compute MD5 hash
    const hash = createHash('md5')
      .update(composite)
      .digest('hex')
      .substring(0, 16); // Use first 16 chars for brevity

    // Cache result
    this.cachedVersion = hash;
    this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;

    return hash;
  }

  /**
   * Invalidate cached version
   *
   * Call this after modifying template packs to force recomputation
   * on next getSchemaVersion() call.
   */
  invalidateCache(): void {
    this.cachedVersion = null;
    this.cacheExpiry = 0;
  }

  /**
   * Get detailed schema information including version
   *
   * Used by MCP controller /mcp/schema/version endpoint
   *
   * @returns Schema version details
   */
  async getSchemaVersionDetails(): Promise<{
    version: string;
    computed_at: string;
    pack_count: number;
    latest_update: string | null;
  }> {
    const version = await this.getSchemaVersion();

    // Fetch packs again for metadata (could optimize by caching)
    const result = await this.templatePackService.listTemplatePacks({
      limit: 1000,
      page: 1,
    });

    // Find latest updated_at
    const latestUpdate =
      result.packs.length > 0
        ? result.packs
            .map((p) => new Date(p.updated_at).getTime())
            .reduce((max, ts) => Math.max(max, ts), 0)
        : null;

    return {
      version,
      computed_at: new Date().toISOString(),
      pack_count: result.total,
      latest_update: latestUpdate ? new Date(latestUpdate).toISOString() : null,
    };
  }

  /**
   * Compare two version hashes
   *
   * @param v1 First version hash
   * @param v2 Second version hash
   * @returns True if versions are different
   */
  hasVersionChanged(v1: string, v2: string): boolean {
    return v1 !== v2;
  }
}

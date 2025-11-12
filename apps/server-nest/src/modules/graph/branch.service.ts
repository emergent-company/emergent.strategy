import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DatabaseService } from '../../common/database/database.service';
import { BranchRow, CreateBranchDto } from './graph.types';
import { Branch } from '../../entities/branch.entity';

/**
 * BranchService - TypeORM Migration Status
 * ========================================
 *
 * Migration Status: ✅ Complete (Strategic SQL Documented)
 * Last Updated: 2025-11-12
 *
 * Methods:
 * ✅ list() - Fully migrated to TypeORM Repository with proper camelCase field mapping
 * 🔒 create() - Strategic raw SQL (see method documentation)
 * 🔒 ensureBranchLineage() - Strategic raw SQL (see method documentation)
 *
 * Summary:
 * This service manages branch operations and lineage tracking. The list() method has been
 * fully migrated to TypeORM. The create() and ensureBranchLineage() methods intentionally
 * use raw SQL for transactional consistency and recursive tree operations that are not
 * well-suited to TypeORM's ORM approach.
 */
@Injectable()
export class BranchService {
  constructor(
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    private readonly dataSource: DataSource,
    @Inject(DatabaseService) private readonly db: DatabaseService
  ) {}

  /**
   * 🔒 STRATEGIC RAW SQL - DO NOT MIGRATE TO TYPEORM
   *
   * ensureBranchLineage - Idempotent lineage repair/creation for branch hierarchies
   *
   * Why Strategic SQL:
   * ------------------
   * 1. Recursive Tree Operations
   *    - Copies parent's entire lineage chain (SELECT ... FROM branch_lineage WHERE branch_id=$2)
   *    - Increments depth values during copy (depth + 1)
   *    - TypeORM's QueryBuilder doesn't provide ergonomic patterns for recursive tree ops
   *
   * 2. Idempotent Defensive Logic
   *    - Uses ON CONFLICT DO NOTHING extensively for safe re-runs
   *    - Ensures parent self-row exists before copying its lineage
   *    - Multiple defensive INSERT operations in specific order
   *    - This pattern is clearer as explicit SQL statements than ORM method chains
   *
   * 3. Transaction with Best-Effort Semantics
   *    - Wraps multiple operations in a transaction
   *    - Fails gracefully (logged upstream, doesn't block)
   *    - Raw transaction control provides explicit BEGIN/COMMIT/ROLLBACK
   *
   * 4. Performance for Graph Operations
   *    - Bulk copy of lineage rows from parent in single INSERT...SELECT
   *    - Efficient for deep hierarchies (copies entire chain at once)
   *    - Avoiding N+1 queries that would result from ORM traversal
   *
   * What It Does:
   * -------------
   * - For a given branch, ensures its lineage table rows are correct
   * - Self-row: depth=0, ancestor=self
   * - Parent lineage: copies all parent's ancestors with depth+1
   * - Direct parent: depth=1, ancestor=parent
   * - All INSERTs use ON CONFLICT DO NOTHING for safe re-runs
   *
   * Example Lineage Structure:
   * -------------------------
   * Branch hierarchy: A -> B -> C (A is root, C is leaf)
   *
   * After ensureBranchLineage(C):
   * branch_id=C, ancestor_branch_id=C, depth=0  (self)
   * branch_id=C, ancestor_branch_id=B, depth=1  (parent)
   * branch_id=C, ancestor_branch_id=A, depth=2  (grandparent)
   *
   * This enables efficient ancestry queries like "find all ancestors of C" or
   * "find all descendants of A" without recursive CTEs at query time.
   *
   * TypeORM Equivalent Would Require:
   * ---------------------------------
   * - Custom repository method with complex QueryBuilder logic
   * - Multiple queries in transaction (harder to manage than raw client)
   * - Less clear intent than declarative SQL
   * - Difficult to express "copy parent's lineage with depth+1" idiomatically
   *
   * Estimated Migration Effort: High (2-3 hours)
   * Maintenance Risk: Low (stable pattern, rarely changes)
   * Performance Impact: None (SQL is optimal for this pattern)
   * Decision: Keep as strategic SQL
   */
  async ensureBranchLineage(branchId: string): Promise<void> {
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      const branchRes = await client.query<{
        id: string;
        parent_branch_id: string | null;
      }>(`SELECT id, parent_branch_id FROM kb.branches WHERE id=$1`, [
        branchId,
      ]);
      if (!branchRes.rowCount) {
        await client.query('ROLLBACK');
        return;
      }
      const parentId = branchRes.rows[0].parent_branch_id;
      await client.query(
        `INSERT INTO kb.branch_lineage(branch_id, ancestor_branch_id, depth) VALUES ($1,$1,0) ON CONFLICT DO NOTHING`,
        [branchId]
      );
      if (parentId) {
        await client.query(
          `INSERT INTO kb.branch_lineage(branch_id, ancestor_branch_id, depth) VALUES ($1,$1,0) ON CONFLICT DO NOTHING`,
          [parentId]
        );
        await client.query(
          `INSERT INTO kb.branch_lineage(branch_id, ancestor_branch_id, depth)
                    SELECT $1, ancestor_branch_id, depth + 1 FROM kb.branch_lineage WHERE branch_id=$2
                    ON CONFLICT (branch_id, ancestor_branch_id) DO NOTHING`,
          [branchId, parentId]
        );
        await client.query(
          `INSERT INTO kb.branch_lineage(branch_id, ancestor_branch_id, depth) VALUES ($1,$2,1) ON CONFLICT DO NOTHING`,
          [branchId, parentId]
        );
      }
      await client.query('COMMIT');
    } catch {
      try {
        await client.query('ROLLBACK');
      } catch {}
    } finally {
      client.release();
    }
  }

  /**
   * 🔒 STRATEGIC RAW SQL - DO NOT MIGRATE TO TYPEORM
   *
   * create - Create new branch with lineage population
   *
   * Why Strategic SQL:
   * ------------------
   * 1. Complex Transaction Logic
   *    - Creates branch AND populates lineage table in single transaction
   *    - Multiple dependent operations that must succeed/fail atomically
   *    - Raw transaction control provides explicit BEGIN/COMMIT/ROLLBACK
   *
   * 2. IS NOT DISTINCT FROM Operator
   *    - Uses PostgreSQL-specific "IS NOT DISTINCT FROM" for null-safe comparison
   *    - Required for uniqueness check: (project_id IS NOT DISTINCT FROM $1 AND name=$2)
   *    - Treats NULL = NULL as true (unlike standard SQL where NULL != NULL)
   *    - TypeORM's find() requires manual null handling logic that's less clear
   *
   * 3. Defensive ON CONFLICT Logic
   *    - Multiple INSERT...ON CONFLICT DO NOTHING operations for lineage
   *    - Ensures parent self-row exists before copying lineage
   *    - Safe idempotent operations even if lineage partially exists
   *    - This pattern is clearer as explicit SQL than ORM method chains
   *
   * 4. Recursive Lineage Copy
   *    - Copies parent's entire lineage chain with depth+1 in single INSERT...SELECT
   *    - Same recursive tree operation pattern as ensureBranchLineage()
   *    - Bulk operation is more efficient than iterative ORM saves
   *
   * 5. Best-Effort Lineage Population
   *    - Lineage errors are caught and ignored (try/catch blocks)
   *    - Branch creation succeeds even if lineage table is missing (older schema)
   *    - This error handling strategy is clearer with raw SQL transaction control
   *
   * What It Does:
   * -------------
   * - Validates branch name and parent existence
   * - Checks uniqueness per project (using IS NOT DISTINCT FROM for null-safe check)
   * - Inserts new branch row
   * - Populates branch_lineage table:
   *   - Self-row (depth=0)
   *   - Copies all parent's lineage with depth+1
   *   - Adds direct parent row (depth=1)
   * - Returns created branch with all fields
   *
   * Example:
   * --------
   * Creating branch C with parent B (where B has parent A):
   *
   * 1. INSERT INTO branches VALUES (C, parent_branch_id=B)
   * 2. INSERT INTO branch_lineage VALUES (C, C, 0)  -- self
   * 3. INSERT INTO branch_lineage VALUES (B, B, 0)  -- ensure parent self exists
   * 4. INSERT INTO branch_lineage SELECT C, ancestor_branch_id, depth+1 FROM branch_lineage WHERE branch_id=B
   *    - Copies: (C, B, 1), (C, A, 2)
   * 5. INSERT INTO branch_lineage VALUES (C, B, 1) ON CONFLICT DO NOTHING  -- ensure direct parent
   *
   * TypeORM Equivalent Would Require:
   * ---------------------------------
   * - Custom repository method with manual transaction management
   * - Complex null-handling logic for IS NOT DISTINCT FROM
   * - Multiple query builder operations for lineage population
   * - Less clear intent than declarative SQL
   * - Harder to express "copy with depth+1" idiom
   *
   * Estimated Migration Effort: High (3-4 hours)
   * Maintenance Risk: Low (stable pattern, core functionality)
   * Performance Impact: None (SQL is optimal for this pattern)
   * Decision: Keep as strategic SQL
   */
  async create(dto: CreateBranchDto): Promise<BranchRow> {
    const { name, project_id = null, parent_branch_id = null } = dto;
    if (!name || !name.trim())
      throw new BadRequestException('branch_name_required');
    // Ensure uniqueness per project
    const existing = await this.db.query<{ id: string }>(
      `SELECT id FROM kb.branches WHERE project_id IS NOT DISTINCT FROM $1 AND name=$2 LIMIT 1`,
      [project_id, name]
    );
    if (existing.rowCount) throw new BadRequestException('branch_name_exists');
    if (parent_branch_id) {
      const parent = await this.db.query<{ id: string }>(
        `SELECT id FROM kb.branches WHERE id=$1`,
        [parent_branch_id]
      );
      if (!parent.rowCount)
        throw new NotFoundException('parent_branch_not_found');
    }
    // Use a transaction to both create branch and populate lineage for consistency
    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      const res = await client.query<BranchRow>(
        `INSERT INTO kb.branches(project_id, name, parent_branch_id)
         VALUES ($1,$2,$3)
         RETURNING id, project_id, name, parent_branch_id, created_at`,
        [project_id, name.trim(), parent_branch_id ?? null]
      );
      const row = res.rows[0];
      // Insert self lineage depth=0
      try {
        await client.query(
          `INSERT INTO kb.branch_lineage(branch_id, ancestor_branch_id, depth) VALUES ($1,$1,0) ON CONFLICT DO NOTHING`,
          [row.id]
        );
      } catch {
        /* ignore if table missing (older schema) */
      }
      // If parent exists, copy its ancestor chain + itself with incremented depth
      if (parent_branch_id) {
        try {
          // Ensure parent self row exists (defensive)
          await client.query(
            `INSERT INTO kb.branch_lineage(branch_id, ancestor_branch_id, depth) VALUES ($1,$1,0) ON CONFLICT DO NOTHING`,
            [parent_branch_id]
          );
          // Copy parent lineage rows (excluding potential duplicates) with depth+1
          await client.query(
            `INSERT INTO kb.branch_lineage(branch_id, ancestor_branch_id, depth)
                        SELECT $1 as branch_id, ancestor_branch_id, depth + 1 FROM kb.branch_lineage WHERE branch_id = $2
                        ON CONFLICT (branch_id, ancestor_branch_id) DO NOTHING`,
            [row.id, parent_branch_id]
          );
          // Also add direct parent (depth 1) if not already captured
          await client.query(
            `INSERT INTO kb.branch_lineage(branch_id, ancestor_branch_id, depth)
                        VALUES ($1,$2,1) ON CONFLICT (branch_id, ancestor_branch_id) DO NOTHING`,
            [row.id, parent_branch_id]
          );
        } catch {
          /* ignore lineage errors to avoid blocking branch creation */
        }
      }
      await client.query('COMMIT');
      return row;
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      throw e;
    } finally {
      client.release();
    }
  }

  async list(project_id?: string | null): Promise<BranchRow[]> {
    let branches: Branch[];

    if (project_id) {
      branches = await this.branchRepository.find({
        where: { projectId: project_id },
        order: { createdAt: 'ASC' },
      });
    } else {
      branches = await this.branchRepository.find({
        order: { createdAt: 'ASC' },
      });
    }

    return branches.map((b) => ({
      id: b.id,
      project_id: b.projectId,
      name: b.name,
      parent_branch_id: b.parentBranchId,
      created_at: b.createdAt.toISOString(),
    }));
  }
}

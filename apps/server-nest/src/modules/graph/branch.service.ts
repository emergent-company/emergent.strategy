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

@Injectable()
export class BranchService {
  constructor(
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    private readonly dataSource: DataSource,
    @Inject(DatabaseService) private readonly db: DatabaseService
  ) {}

  /**
   * ensureBranchLineage performs an idempotent repair/creation of lineage rows for a given branch.
   * If the branch has a parent, parent's lineage (including itself) is copied with depth+1 and the
   * branch self row (depth=0) is asserted. Safe to call repeatedly. Best-effort: failures are logged upstream.
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

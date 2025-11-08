import {
  ConflictException,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DatabaseService } from '../../common/database/database.service';
import { AppConfigService } from '../../common/config/config.service';
import { OrgDto } from './dto/org.dto';
import { Org } from '../../entities/org.entity';
import { OrganizationMembership } from '../../entities/organization-membership.entity';

@Injectable()
export class OrgsService {
  // In-process authoritative data (offline fallback only; stripped example seeds)
  private data: OrgDto[] = [];
  // Track when the backing tables are unavailable (42P01) so we can serve in-memory cache even while DB reports online
  private tableMissing = false;

  constructor(
    @InjectRepository(Org) private orgRepo: Repository<Org>,
    @InjectRepository(OrganizationMembership)
    private membershipRepo: Repository<OrganizationMembership>,
    private dataSource: DataSource,
    private readonly db: DatabaseService,
    private readonly cfg: AppConfigService
  ) {}

  async list(userId?: string): Promise<OrgDto[]> {
    if (!this.db.isOnline()) return this.cloneData();

    const runQuery = async (): Promise<OrgDto[]> => {
      // SECURITY: Only return organizations the user is a member of when DB is available
      if (!userId) return [];

      // Use raw query since we're joining across entities without defined relation
      const result = await this.dataSource.query(
        `SELECT o.id, o.name 
                 FROM kb.orgs o
                 INNER JOIN kb.organization_memberships om ON o.id = om.organization_id
                 WHERE om.user_id = $1
                 ORDER BY o.created_at DESC`,
        [userId]
      );

      return result.map((r: any) => ({ id: r.id, name: r.name }));
    };

    if (this.tableMissing) {
      try {
        const rows = await runQuery();
        if (rows.length) {
          this.tableMissing = false;
          return rows;
        }
        return this.cloneData();
      } catch (e: any) {
        if (e && e.code === '42P01') return this.cloneData();
        throw e;
      }
    }

    try {
      const rows = await runQuery();
      this.tableMissing = false;
      return rows;
    } catch (e: any) {
      if (e && e.code === '42P01') {
        this.tableMissing = true;
        return this.cloneData();
      }
      throw e;
    }
  }

  async get(id: string): Promise<OrgDto | null> {
    if (!this.db.isOnline()) return this.findInMemory(id);

    const runQuery = async () => {
      const org = await this.orgRepo.findOne({ where: { id } });
      if (!org) return null;
      return { id: org.id, name: org.name };
    };

    if (this.tableMissing) {
      try {
        const result = await runQuery();
        if (result) {
          this.tableMissing = false;
          return result;
        }
        return this.findInMemory(id);
      } catch (e: any) {
        if (e && e.code === '42P01') return this.findInMemory(id);
        throw e;
      }
    }

    try {
      const result = await runQuery();
      this.tableMissing = false;
      return result;
    } catch (e: any) {
      if (e && e.code === '42P01') {
        this.tableMissing = true;
        return this.findInMemory(id);
      }
      throw e;
    }
  }

  async create(name: string, userId?: string): Promise<OrgDto> {
    if (!this.db.isOnline() || this.tableMissing) {
      return this.createInMemory(name);
    }
    // Count user's existing orgs (per-user limit, not global)
    try {
      if (userId) {
        const count = await this.membershipRepo
          .createQueryBuilder('om')
          .where('om.user_id = :userId', { userId })
          .getCount();

        if (count >= 100) {
          throw new ConflictException(
            'Organization limit reached (100). You can create up to 100 organizations.'
          );
        }
      }

      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const org = this.orgRepo.create({ name });
        const savedOrg = await queryRunner.manager.save(org);

        if (userId) {
          // Auto-assign creator as org_admin
          // Note: user profile must already exist in core.user_profiles (created during authentication)
          // The FK constraint will enforce this and fail with a meaningful error if missing
          const membership = this.membershipRepo.create({
            organizationId: savedOrg.id,
            userId,
            role: 'org_admin',
          });
          await queryRunner.manager.save(membership);
        }

        await queryRunner.commitTransaction();
        this.tableMissing = false;
        return { id: savedOrg.id, name: savedOrg.name };
      } catch (err: any) {
        await queryRunner.rollbackTransaction();

        if (err && err.code === '23505') {
          // unique_violation
          throw new ConflictException({
            message: 'Organization name already exists',
            details: { name: ['already exists'] },
          });
        }
        if (err && err.code === '23503') {
          // foreign_key_violation
          // This should be rare - ScopesGuard should ensure profile exists
          throw new BadRequestException({
            message:
              'User profile initialization failed. Please try logging out and back in.',
            details: { userId: ['User profile not properly initialized'] },
          });
        }
        throw err;
      } finally {
        await queryRunner.release();
      }
    } catch (e: any) {
      if (e && e.code === '42P01') {
        this.tableMissing = true;
        return this.createInMemory(name);
      }
      throw e;
    }
  }

  async delete(id: string): Promise<boolean> {
    if (!this.db.isOnline() || this.tableMissing) {
      const before = this.data.length;
      this.data = this.data.filter((o) => o.id !== id);
      return this.data.length !== before;
    }
    try {
      const result = await this.orgRepo.delete(id);
      this.tableMissing = false;
      return (result.affected || 0) > 0;
    } catch (e: any) {
      if (e && e.code === '42P01') {
        this.tableMissing = true;
        const before = this.data.length;
        this.data = this.data.filter((o) => o.id !== id);
        return this.data.length !== before;
      }
      throw e;
    }
  }

  private cloneData(): OrgDto[] {
    return this.data.map((o) => ({ ...o }));
  }

  private findInMemory(id: string): OrgDto | null {
    return this.data.find((o) => o.id === id) || null;
  }

  private createInMemory(name: string): OrgDto {
    if (this.data.some((o) => o.name.toLowerCase() === name.toLowerCase())) {
      throw new ConflictException({
        message: 'Organization name already exists',
        details: { name: ['already exists'] },
      });
    }
    if (this.data.length >= 100)
      throw new ConflictException('Organization limit reached (100)');
    const id = `mem_${Math.random().toString(36).slice(2, 10)}`;
    const org = { id, name };
    this.data.push(org);
    return org;
  }
}

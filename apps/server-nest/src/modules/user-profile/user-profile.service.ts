import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { UserProfileDto, UpdateUserProfileDto, AlternativeEmailDto } from './dto/profile.dto';

@Injectable()
export class UserProfileService {
    constructor(private readonly db: DatabaseService) { }

    private map(row: any): UserProfileDto {
        return {
            id: row.id,
            subjectId: row.zitadel_user_id,  // Legacy field name for backwards compat
            zitadelUserId: row.zitadel_user_id,
            firstName: row.first_name,
            lastName: row.last_name,
            displayName: row.display_name,
            phoneE164: row.phone_e164,
            avatarObjectKey: row.avatar_object_key,
        };
    }

    async get(subjectId: string): Promise<UserProfileDto | null> {
        const q = await this.db.query<any>(`SELECT id, zitadel_user_id, first_name, last_name, display_name, phone_e164, avatar_object_key FROM core.user_profiles WHERE zitadel_user_id = $1`, [subjectId]);
        if (!q.rowCount) return null;
        return this.map(q.rows[0]);
    }

    async getById(userId: string): Promise<UserProfileDto | null> {
        const q = await this.db.query<any>(`SELECT id, zitadel_user_id, first_name, last_name, display_name, phone_e164, avatar_object_key FROM core.user_profiles WHERE id = $1`, [userId]);
        if (!q.rowCount) return null;
        return this.map(q.rows[0]);
    }

    async upsertBase(subjectId: string): Promise<void> {
        await this.db.query(`INSERT INTO core.user_profiles(zitadel_user_id) VALUES ($1) ON CONFLICT (zitadel_user_id) DO NOTHING`, [subjectId]);
    }

    async update(subjectId: string, patch: UpdateUserProfileDto): Promise<UserProfileDto> {
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;
        for (const [k, v] of Object.entries(patch)) {
            if (v === undefined) continue;
            const col = k.replace(/([A-Z])/g, '_$1').toLowerCase(); // camelCase -> snake_case (simple mapping)
            fields.push(`${col} = $${++idx}`);
            values.push(v);
        }
        if (!fields.length) {
            const existing = await this.get(subjectId);
            if (!existing) throw new Error('not_found');
            return existing;
        }
        values.unshift(subjectId);
        const sql = `UPDATE core.user_profiles SET ${fields.join(', ')}, updated_at = now() WHERE zitadel_user_id = $1 RETURNING id, zitadel_user_id, first_name, last_name, display_name, phone_e164, avatar_object_key`;
        const q = await this.db.query<any>(sql, values);
        if (!q.rowCount) throw new Error('not_found');
        return this.map(q.rows[0]);
    }

    async listAlternativeEmails(subjectId: string): Promise<AlternativeEmailDto[]> {
        // Look up user by zitadel_user_id first, then use internal id
        const user = await this.get(subjectId);
        if (!user) return [];
        const q = await this.db.query<any>(`SELECT email, verified, created_at FROM core.user_emails WHERE user_id = $1 ORDER BY created_at ASC`, [user.id]);
        return q.rows.map(r => ({ email: r.email, verified: r.verified, createdAt: r.created_at.toISOString?.() || r.created_at }));
    }

    async addAlternativeEmail(subjectId: string, emailRaw: string): Promise<AlternativeEmailDto> {
        const email = emailRaw.trim().toLowerCase();
        await this.upsertBase(subjectId);
        const user = await this.get(subjectId);
        if (!user) throw new Error('User not found after upsert');
        const q = await this.db.query<any>(`INSERT INTO core.user_emails (user_id, email, verified) VALUES ($1, $2, false)
      ON CONFLICT (user_id, email) DO UPDATE SET email = core.user_emails.email RETURNING email, verified, created_at`, [user.id, email]);
        // TODO: trigger verification email dispatch (out of scope now)
        const r = q.rows[0];
        return { email: r.email, verified: r.verified, createdAt: r.created_at.toISOString?.() || r.created_at };
    }

    async deleteAlternativeEmail(subjectId: string, emailRaw: string): Promise<{ status: 'deleted' }> {
        const email = emailRaw.trim().toLowerCase();
        const user = await this.get(subjectId);
        if (!user) throw new Error('User not found');
        await this.db.query(`DELETE FROM core.user_emails WHERE user_id = $1 AND email = $2`, [user.id, email]);
        return { status: 'deleted' };
    }
}

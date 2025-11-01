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

    async get(zitadelUserId: string): Promise<UserProfileDto | null> {
        // Used by auth service - accepts Zitadel ID
        const q = await this.db.query<any>(`SELECT id, zitadel_user_id, first_name, last_name, display_name, phone_e164, avatar_object_key FROM core.user_profiles WHERE zitadel_user_id = $1`, [zitadelUserId]);
        if (!q.rowCount) return null;
        return this.map(q.rows[0]);
    }

    async getById(userId: string): Promise<UserProfileDto | null> {
        // Used by controllers - accepts internal UUID
        const q = await this.db.query<any>(`SELECT id, zitadel_user_id, first_name, last_name, display_name, phone_e164, avatar_object_key FROM core.user_profiles WHERE id = $1`, [userId]);
        if (!q.rowCount) return null;
        return this.map(q.rows[0]);
    }

    async upsertBase(subjectId: string): Promise<void> {
        // Legacy method - still uses Zitadel ID for backwards compatibility
        await this.db.query(`INSERT INTO core.user_profiles(zitadel_user_id) VALUES ($1) ON CONFLICT (zitadel_user_id) DO NOTHING`, [subjectId]);
    }

    async update(userId: string, patch: UpdateUserProfileDto): Promise<UserProfileDto> {
        const fields: string[] = [];
        const values: any[] = [];
        let idx = 1;
        for (const [k, v] of Object.entries(patch)) {
            if (v === undefined) continue;
            // Convert camelCase to snake_case: phoneE164 -> phone_e164
            const col = k.replace(/([A-Z])/g, (match, p1, offset) => (offset > 0 ? '_' : '') + match.toLowerCase());
            fields.push(`${col} = $${++idx}`);
            values.push(v);
        }
        if (!fields.length) {
            const existing = await this.getById(userId); // Use getById for UUID lookup
            if (!existing) throw new Error('not_found');
            return existing;
        }
        values.unshift(userId);
        const sql = `UPDATE core.user_profiles SET ${fields.join(', ')}, updated_at = now() WHERE id = $1 RETURNING id, zitadel_user_id, first_name, last_name, display_name, phone_e164, avatar_object_key`;
        const q = await this.db.query<any>(sql, values);
        if (!q.rowCount) throw new Error('not_found');
        return this.map(q.rows[0]);
    }

    async listAlternativeEmails(userId: string): Promise<AlternativeEmailDto[]> {
        const q = await this.db.query<any>(`SELECT email, verified, created_at FROM core.user_emails WHERE user_id = $1 ORDER BY created_at ASC`, [userId]);
        return q.rows.map((r: any) => ({ email: r.email, verified: r.verified, createdAt: r.created_at.toISOString?.() || r.created_at }));
    }

    async addAlternativeEmail(userId: string, emailRaw: string): Promise<AlternativeEmailDto> {
        const email = emailRaw.trim().toLowerCase();

        // Check if email already exists for this user
        const existing = await this.db.query<any>(
            `SELECT email, verified, created_at FROM core.user_emails WHERE user_id = $1 AND email = $2`,
            [userId, email]
        );
        if (existing.rows.length > 0) {
            const r = existing.rows[0];
            return { email: r.email, verified: r.verified, createdAt: r.created_at.toISOString?.() || r.created_at };
        }

        // Insert new email
        const q = await this.db.query<any>(
            `INSERT INTO core.user_emails (user_id, email, verified) VALUES ($1, $2, false) RETURNING email, verified, created_at`,
            [userId, email]
        );
        // TODO: trigger verification email dispatch (out of scope now)
        const r = q.rows[0];
        return { email: r.email, verified: r.verified, createdAt: r.created_at.toISOString?.() || r.created_at };
    }

    async deleteAlternativeEmail(userId: string, emailRaw: string): Promise<{ status: 'deleted' }> {
        const email = emailRaw.trim().toLowerCase();
        await this.db.query(`DELETE FROM core.user_emails WHERE user_id = $1 AND email = $2`, [userId, email]);
        return { status: 'deleted' };
    }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseService } from '../../common/database/database.service';
import {
  UserProfileDto,
  UpdateUserProfileDto,
  AlternativeEmailDto,
} from './dto/profile.dto';
import { UserProfile } from '../../entities/user-profile.entity';
import { UserEmail } from '../../entities/user-email.entity';

@Injectable()
export class UserProfileService {
  private readonly logger = new Logger(UserProfileService.name);
  constructor(
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
    @InjectRepository(UserEmail)
    private readonly userEmailRepository: Repository<UserEmail>,
    private readonly db: DatabaseService
  ) {}

  private map(row: any): UserProfileDto {
    return {
      id: row.id,
      subjectId: row.zitadel_user_id, // Legacy field name for backwards compat
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
    const profile = await this.userProfileRepository.findOne({
      where: { zitadelUserId },
    });
    if (!profile) return null;
    return this.mapEntity(profile);
  }

  async getById(userId: string): Promise<UserProfileDto | null> {
    // Used by controllers - accepts internal UUID
    const profile = await this.userProfileRepository.findOne({
      where: { id: userId },
    });
    if (!profile) return null;
    return this.mapEntity(profile);
  }

  async upsertBase(subjectId: string): Promise<void> {
    // Minimal upsert for auth service: just create row if not exists
    await this.userProfileRepository.upsert({ zitadelUserId: subjectId }, [
      'zitadelUserId',
    ]);
  }

  private mapEntity(profile: UserProfile): UserProfileDto {
    return {
      id: profile.id,
      subjectId: profile.zitadelUserId,
      zitadelUserId: profile.zitadelUserId,
      firstName: profile.firstName,
      lastName: profile.lastName,
      displayName: profile.displayName,
      phoneE164: profile.phoneE164,
      avatarObjectKey: profile.avatarObjectKey,
    };
  }

  async update(
    userId: string,
    patch: UpdateUserProfileDto
  ): Promise<UserProfileDto> {
    const profile = await this.userProfileRepository.findOne({
      where: { id: userId },
    });
    if (!profile) throw new Error('not_found');

    // Update only provided fields
    if (patch.firstName !== undefined) profile.firstName = patch.firstName;
    if (patch.lastName !== undefined) profile.lastName = patch.lastName;
    if (patch.displayName !== undefined)
      profile.displayName = patch.displayName;
    if (patch.phoneE164 !== undefined) profile.phoneE164 = patch.phoneE164;

    const updated = await this.userProfileRepository.save(profile);
    return this.mapEntity(updated);
  }

  async listAlternativeEmails(userId: string): Promise<AlternativeEmailDto[]> {
    const emails = await this.userEmailRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
    return emails.map((e) => ({
      email: e.email,
      verified: e.verified,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  async addAlternativeEmail(
    userId: string,
    emailRaw: string
  ): Promise<AlternativeEmailDto> {
    const email = emailRaw.trim().toLowerCase();

    // Check if email already exists for this user
    const existing = await this.userEmailRepository.findOne({
      where: { userId, email },
    });
    if (existing) {
      return {
        email: existing.email,
        verified: existing.verified,
        createdAt: existing.createdAt.toISOString(),
      };
    }

    // Insert new email
    const newEmail = this.userEmailRepository.create({
      userId,
      email,
      verified: false,
    });
    const saved = await this.userEmailRepository.save(newEmail);

    // TODO: trigger verification email dispatch (out of scope now)
    return {
      email: saved.email,
      verified: saved.verified,
      createdAt: saved.createdAt.toISOString(),
    };
  }

  async deleteAlternativeEmail(
    userId: string,
    emailRaw: string
  ): Promise<{ status: 'deleted' }> {
    const email = emailRaw.trim().toLowerCase();
    await this.userEmailRepository.delete({ userId, email });
    return { status: 'deleted' };
  }
}

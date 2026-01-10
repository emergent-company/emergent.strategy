import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { UserEmailPreferences } from '../../entities/user-email-preferences.entity';
import { UserEmail } from '../../entities/user-email.entity';
import {
  EmailPreferencesDto,
  UpdateEmailPreferencesDto,
  UnsubscribeResultDto,
  UnsubscribeInfoDto,
} from './dto/email-preferences.dto';

@Injectable()
export class UserEmailPreferencesService {
  private readonly logger = new Logger(UserEmailPreferencesService.name);

  constructor(
    @InjectRepository(UserEmailPreferences)
    private readonly prefsRepository: Repository<UserEmailPreferences>,
    @InjectRepository(UserEmail)
    private readonly userEmailRepository: Repository<UserEmail>
  ) {}

  async getPreferences(userId: string): Promise<EmailPreferencesDto> {
    let prefs = await this.prefsRepository.findOne({ where: { userId } });

    if (!prefs) {
      prefs = await this.createDefaultPreferences(userId);
    }

    return this.mapToDto(prefs);
  }

  async updatePreferences(
    userId: string,
    dto: UpdateEmailPreferencesDto
  ): Promise<EmailPreferencesDto> {
    let prefs = await this.prefsRepository.findOne({ where: { userId } });

    if (!prefs) {
      prefs = await this.createDefaultPreferences(userId);
    }

    if (dto.releaseEmailsEnabled !== undefined) {
      prefs.releaseEmailsEnabled = dto.releaseEmailsEnabled;
    }
    if (dto.marketingEmailsEnabled !== undefined) {
      prefs.marketingEmailsEnabled = dto.marketingEmailsEnabled;
    }

    const updated = await this.prefsRepository.save(prefs);
    this.logger.log(`Updated email preferences for user ${userId}`);

    return this.mapToDto(updated);
  }

  async getUnsubscribeInfo(token: string): Promise<UnsubscribeInfoDto | null> {
    const prefs = await this.prefsRepository.findOne({
      where: { unsubscribeToken: token },
      relations: ['user'],
    });

    if (!prefs) {
      return null;
    }

    const primaryEmail = await this.userEmailRepository.findOne({
      where: { userId: prefs.userId },
      order: { createdAt: 'ASC' },
    });

    return {
      email: primaryEmail?.email
        ? this.maskEmail(primaryEmail.email)
        : 'Unknown',
      releaseEmailsEnabled: prefs.releaseEmailsEnabled,
      marketingEmailsEnabled: prefs.marketingEmailsEnabled,
    };
  }

  async unsubscribeByToken(
    token: string,
    emailType: 'release' | 'marketing' | 'all' = 'all'
  ): Promise<UnsubscribeResultDto> {
    const prefs = await this.prefsRepository.findOne({
      where: { unsubscribeToken: token },
    });

    if (!prefs) {
      return {
        success: false,
        emailType,
        message: 'Invalid or expired unsubscribe link',
      };
    }

    switch (emailType) {
      case 'release':
        prefs.releaseEmailsEnabled = false;
        break;
      case 'marketing':
        prefs.marketingEmailsEnabled = false;
        break;
      case 'all':
        prefs.releaseEmailsEnabled = false;
        prefs.marketingEmailsEnabled = false;
        break;
    }

    await this.prefsRepository.save(prefs);
    this.logger.log(
      `Unsubscribed user ${prefs.userId} from ${emailType} emails via token`
    );

    return {
      success: true,
      emailType,
      message: 'Successfully unsubscribed',
    };
  }

  async getOrCreateUnsubscribeToken(userId: string): Promise<string> {
    let prefs = await this.prefsRepository.findOne({ where: { userId } });

    if (!prefs) {
      prefs = await this.createDefaultPreferences(userId);
    }

    return prefs.unsubscribeToken;
  }

  async isReleaseEmailsEnabled(userId: string): Promise<boolean> {
    const prefs = await this.prefsRepository.findOne({ where: { userId } });
    return prefs?.releaseEmailsEnabled ?? true;
  }

  async isMarketingEmailsEnabled(userId: string): Promise<boolean> {
    const prefs = await this.prefsRepository.findOne({ where: { userId } });
    return prefs?.marketingEmailsEnabled ?? true;
  }

  /**
   * Create default preferences using upsert to handle race conditions.
   * If another request creates preferences simultaneously, we fetch the existing record.
   */
  private async createDefaultPreferences(
    userId: string
  ): Promise<UserEmailPreferences> {
    const token = randomBytes(32).toString('hex');

    try {
      // Use upsert with ON CONFLICT DO NOTHING to handle race conditions
      await this.prefsRepository
        .createQueryBuilder()
        .insert()
        .into(UserEmailPreferences)
        .values({
          userId,
          releaseEmailsEnabled: true,
          marketingEmailsEnabled: true,
          unsubscribeToken: token,
        })
        .orIgnore() // ON CONFLICT DO NOTHING
        .execute();

      // Fetch the record (either just created or existing from race condition)
      const prefs = await this.prefsRepository.findOne({ where: { userId } });
      if (!prefs) {
        // This shouldn't happen, but handle it gracefully
        throw new Error(
          `Failed to create or retrieve email preferences for user ${userId}`
        );
      }

      this.logger.log(`Ensured email preferences exist for user ${userId}`);
      return prefs;
    } catch (error) {
      // If upsert failed for any reason, try to fetch existing record
      const existing = await this.prefsRepository.findOne({
        where: { userId },
      });
      if (existing) {
        return existing;
      }
      throw error;
    }
  }

  private mapToDto(prefs: UserEmailPreferences): EmailPreferencesDto {
    return {
      userId: prefs.userId,
      releaseEmailsEnabled: prefs.releaseEmailsEnabled,
      marketingEmailsEnabled: prefs.marketingEmailsEnabled,
      updatedAt: prefs.updatedAt.toISOString(),
    };
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return email;

    const maskedLocal =
      local.length <= 2
        ? local[0] + '*'.repeat(local.length - 1)
        : local[0] + '*'.repeat(local.length - 2) + local[local.length - 1];

    return `${maskedLocal}@${domain}`;
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEmail } from '../../entities/user-email.entity';
import { UserSearchResultDto } from './dto/user-search.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEmail)
    private readonly userEmailRepository: Repository<UserEmail>
  ) {}

  /**
   * Search for users by email address (partial match)
   * Returns up to 10 results, excluding the requesting user
   */
  async searchByEmail(
    emailQuery: string,
    excludeUserId?: string
  ): Promise<UserSearchResultDto[]> {
    const normalizedQuery = emailQuery.toLowerCase().trim();

    if (normalizedQuery.length < 2) {
      return [];
    }

    const queryBuilder = this.userEmailRepository
      .createQueryBuilder('email')
      .innerJoinAndSelect('email.user', 'profile')
      .where('LOWER(email.email) LIKE :query', {
        query: `%${normalizedQuery}%`,
      })
      .orderBy('email.email', 'ASC')
      .limit(10);

    if (excludeUserId) {
      queryBuilder.andWhere('profile.id != :excludeUserId', { excludeUserId });
    }

    const results = await queryBuilder.getMany();

    return results.map((emailRecord) => ({
      id: emailRecord.user.id,
      email: emailRecord.email,
      displayName: emailRecord.user.displayName || undefined,
      firstName: emailRecord.user.firstName || undefined,
      lastName: emailRecord.user.lastName || undefined,
      avatarUrl: emailRecord.user.avatarObjectKey
        ? `/api/files/${emailRecord.user.avatarObjectKey}`
        : undefined,
    }));
  }

  /**
   * Find a user by exact email address
   */
  async findByEmail(email: string): Promise<UserSearchResultDto | null> {
    const normalizedEmail = email.toLowerCase().trim();

    const emailRecord = await this.userEmailRepository.findOne({
      where: { email: normalizedEmail },
      relations: ['user'],
    });

    if (!emailRecord) {
      return null;
    }

    return {
      id: emailRecord.user.id,
      email: emailRecord.email,
      displayName: emailRecord.user.displayName || undefined,
      firstName: emailRecord.user.firstName || undefined,
      lastName: emailRecord.user.lastName || undefined,
      avatarUrl: emailRecord.user.avatarObjectKey
        ? `/api/files/${emailRecord.user.avatarObjectKey}`
        : undefined,
    };
  }
}

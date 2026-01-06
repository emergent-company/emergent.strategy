import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { ApiToken } from '../../entities/api-token.entity';
import {
  ApiTokenDto,
  CreateApiTokenResponseDto,
  ApiTokenScope,
} from './dto/api-token.dto';

/**
 * Token prefix for Emergent API tokens
 */
const TOKEN_PREFIX = 'emt_';

/**
 * Generate a new API token
 * Format: emt_<32-byte-hex> = 4 + 64 = 68 characters
 */
function generateToken(): string {
  const randomPart = randomBytes(32).toString('hex');
  return `${TOKEN_PREFIX}${randomPart}`;
}

/**
 * Hash a token using SHA-256
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Extract the prefix (first 12 chars) from a token
 */
function getTokenPrefix(token: string): string {
  return token.substring(0, 12);
}

@Injectable()
export class ApiTokensService {
  private readonly logger = new Logger(ApiTokensService.name);

  constructor(
    @InjectRepository(ApiToken)
    private readonly tokenRepository: Repository<ApiToken>
  ) {}

  /**
   * Create a new API token for a project
   */
  async create(
    projectId: string,
    userId: string,
    name: string,
    scopes: ApiTokenScope[]
  ): Promise<CreateApiTokenResponseDto> {
    // Check if token name already exists for this project
    const existing = await this.tokenRepository.findOne({
      where: {
        projectId,
        name,
        revokedAt: IsNull(),
      },
    });

    if (existing) {
      throw new ConflictException({
        error: {
          code: 'token-name-exists',
          message: `A token named "${name}" already exists for this project`,
        },
      });
    }

    // Generate token
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    const tokenPrefix = getTokenPrefix(rawToken);

    // Create token record
    const token = this.tokenRepository.create({
      projectId,
      userId,
      name,
      tokenHash,
      tokenPrefix,
      scopes,
    });

    await this.tokenRepository.save(token);

    this.logger.log(
      `Created API token "${name}" (${tokenPrefix}...) for project ${projectId}`
    );

    return {
      id: token.id,
      name: token.name,
      tokenPrefix: token.tokenPrefix,
      scopes: token.scopes,
      createdAt: token.createdAt,
      lastUsedAt: token.lastUsedAt,
      isRevoked: false,
      token: rawToken, // Only returned at creation time
    };
  }

  /**
   * List all tokens for a project
   */
  async listByProject(projectId: string): Promise<ApiTokenDto[]> {
    const tokens = await this.tokenRepository.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });

    return tokens.map(this.mapToDto);
  }

  /**
   * Get a single token by ID
   */
  async getById(
    tokenId: string,
    projectId: string
  ): Promise<ApiTokenDto | null> {
    const token = await this.tokenRepository.findOne({
      where: { id: tokenId, projectId },
    });

    return token ? this.mapToDto(token) : null;
  }

  /**
   * Revoke a token
   */
  async revoke(
    tokenId: string,
    projectId: string,
    userId: string
  ): Promise<void> {
    const token = await this.tokenRepository.findOne({
      where: { id: tokenId, projectId },
    });

    if (!token) {
      throw new NotFoundException({
        error: {
          code: 'token-not-found',
          message: 'Token not found',
        },
      });
    }

    if (token.revokedAt) {
      throw new ConflictException({
        error: {
          code: 'token-already-revoked',
          message: 'Token is already revoked',
        },
      });
    }

    token.revokedAt = new Date();
    await this.tokenRepository.save(token);

    this.logger.log(
      `Revoked API token "${token.name}" (${token.tokenPrefix}...) by user ${userId}`
    );
  }

  /**
   * Validate a raw token and return the associated token record if valid
   * Returns null if token is invalid, revoked, or not found
   */
  async validateToken(rawToken: string): Promise<{
    token: ApiToken;
    projectId: string;
    userId: string;
    scopes: string[];
  } | null> {
    // Check token format
    if (!rawToken.startsWith(TOKEN_PREFIX)) {
      return null;
    }

    const tokenHash = hashToken(rawToken);

    const token = await this.tokenRepository.findOne({
      where: {
        tokenHash,
        revokedAt: IsNull(),
      },
      relations: ['project', 'user'],
    });

    if (!token) {
      return null;
    }

    // Update last used timestamp (fire-and-forget, don't await)
    this.tokenRepository
      .update({ id: token.id }, { lastUsedAt: new Date() })
      .catch((err) => {
        this.logger.warn(`Failed to update last_used_at for token: ${err}`);
      });

    return {
      token,
      projectId: token.projectId,
      userId: token.userId,
      scopes: token.scopes,
    };
  }

  /**
   * Check if a raw token looks like an Emergent API token
   */
  static isApiToken(token: string): boolean {
    return token.startsWith(TOKEN_PREFIX);
  }

  private mapToDto(token: ApiToken): ApiTokenDto {
    return {
      id: token.id,
      name: token.name,
      tokenPrefix: token.tokenPrefix,
      scopes: token.scopes,
      createdAt: token.createdAt,
      lastUsedAt: token.lastUsedAt,
      isRevoked: token.revokedAt !== null,
    };
  }
}

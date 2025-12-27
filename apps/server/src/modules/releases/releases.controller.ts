import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  NotFoundException,
  BadRequestException,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiQuery,
  ApiParam,
  ApiProperty,
} from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { ReleaseNotificationsService } from './services/release-notifications.service';
import { ReleaseChangelogService } from './services/release-changelog.service';
import { ReleaseStatus } from './entities/release-notification.entity';

/**
 * DTO for release list item (minimal data for list view)
 */
class ReleaseListItemDto {
  @ApiProperty({ description: 'Release ID' })
  id: string;

  @ApiProperty({ description: 'Release version', example: 'v2025.01.15' })
  version: string;

  @ApiProperty({ description: 'Number of commits in release' })
  commitCount: number;

  @ApiProperty({ description: 'Release status', enum: ['draft', 'published'] })
  status: ReleaseStatus;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;
}

/**
 * DTO for full release details
 */
class ReleaseDetailDto {
  @ApiProperty({ description: 'Release ID' })
  id: string;

  @ApiProperty({ description: 'Release version', example: 'v2025.01.15' })
  version: string;

  @ApiProperty({ description: 'Starting commit hash' })
  fromCommit: string;

  @ApiProperty({ description: 'Ending commit hash' })
  toCommit: string;

  @ApiProperty({ description: 'Number of commits in release' })
  commitCount: number;

  @ApiProperty({ description: 'Release status', enum: ['draft', 'published'] })
  status: ReleaseStatus;

  @ApiProperty({ description: 'Structured changelog data', nullable: true })
  changelogJson: {
    summary: string;
    features: string[];
    improvements: string[];
    bugFixes: string[];
    breakingChanges: string[];
    otherChanges: string[];
  } | null;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt: Date;
}

/**
 * DTO for creating a release
 */
class CreateReleaseDto {
  @ApiProperty({
    description: 'Starting commit (defaults to last notified commit)',
    required: false,
  })
  fromCommit?: string;

  @ApiProperty({
    description: 'Ending commit (defaults to HEAD)',
    required: false,
  })
  toCommit?: string;

  @ApiProperty({
    description: 'Use raw commit messages instead of LLM-generated changelog',
    required: false,
    default: false,
  })
  rawCommits?: boolean;

  @ApiProperty({
    description: 'Date to get commits since (e.g., "2024-12-01", "1 week ago")',
    required: false,
  })
  since?: string;

  @ApiProperty({
    description: 'Date to get commits until (defaults to now)',
    required: false,
  })
  until?: string;
}

/**
 * DTO for preview request
 */
class PreviewReleaseDto {
  @ApiProperty({
    description: 'Date to get commits since (e.g., "2024-12-01", "1 week ago")',
    required: true,
  })
  since: string;

  @ApiProperty({
    description: 'Date to get commits until (defaults to now)',
    required: false,
  })
  until?: string;

  @ApiProperty({
    description: 'Use raw commit categorization instead of LLM',
    required: false,
    default: true,
  })
  rawCommits?: boolean;
}

/**
 * DTO for git commit in preview response
 */
class GitCommitDto {
  @ApiProperty({ description: 'Full commit hash' })
  hash: string;

  @ApiProperty({ description: 'Short commit hash' })
  shortHash: string;

  @ApiProperty({ description: 'Commit subject line' })
  subject: string;

  @ApiProperty({ description: 'Commit body' })
  body: string;

  @ApiProperty({ description: 'Author name' })
  authorName: string;

  @ApiProperty({ description: 'Author email' })
  authorEmail: string;

  @ApiProperty({ description: 'Commit date' })
  date: Date;
}

/**
 * DTO for preview response
 */
class PreviewReleaseResponseDto {
  @ApiProperty({ description: 'Generated version string' })
  version: string;

  @ApiProperty({ description: 'Number of commits found' })
  commitCount: number;

  @ApiProperty({ description: 'Starting commit/date reference' })
  fromCommit: string;

  @ApiProperty({ description: 'Ending commit/date reference' })
  toCommit: string;

  @ApiProperty({
    description: 'List of commits',
    type: [GitCommitDto],
  })
  commits: GitCommitDto[];

  @ApiProperty({
    description: 'Structured changelog preview',
  })
  changelog: {
    summary: string;
    features: { title: string; description?: string }[];
    improvements: { title: string; description?: string }[];
    bugFixes: { title: string; description?: string }[];
    breakingChanges: { title: string; description?: string }[];
  };
}

/**
 * DTO for created release response
 */
class CreateReleaseResponseDto {
  @ApiProperty({ description: 'Whether the release was created successfully' })
  success: boolean;

  @ApiProperty({ description: 'Release ID', required: false })
  releaseId?: string;

  @ApiProperty({ description: 'Release version', required: false })
  version?: string;

  @ApiProperty({
    description: 'Error message if creation failed',
    required: false,
  })
  error?: string;
}

/**
 * DTO for sending notifications
 */
class SendNotificationsDto {
  @ApiProperty({
    description: 'Target a single user by ID',
    required: false,
  })
  userId?: string;

  @ApiProperty({
    description: 'Target all members of a project',
    required: false,
  })
  projectId?: string;

  @ApiProperty({
    description: 'Target all users',
    required: false,
    default: false,
  })
  allUsers?: boolean;

  @ApiProperty({
    description: 'Preview mode - do not actually send',
    required: false,
    default: false,
  })
  dryRun?: boolean;

  @ApiProperty({
    description: 'Force send even if within debounce window',
    required: false,
    default: false,
  })
  force?: boolean;

  @ApiProperty({
    description: 'Resend to users who already received this release',
    required: false,
    default: false,
  })
  resend?: boolean;
}

/**
 * DTO for recipient result
 */
class RecipientResultDto {
  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'User email', required: false })
  email?: string;

  @ApiProperty({ description: 'User display name', required: false })
  displayName?: string;

  @ApiProperty({ description: 'Whether email was sent' })
  emailSent: boolean;

  @ApiProperty({ description: 'Whether in-app notification was sent' })
  inAppSent: boolean;

  @ApiProperty({ description: 'Whether user was skipped' })
  skipped: boolean;

  @ApiProperty({ description: 'Reason for skipping', required: false })
  skipReason?: string;
}

/**
 * DTO for send notifications response
 */
class SendNotificationsResponseDto {
  @ApiProperty({ description: 'Whether the operation was successful' })
  success: boolean;

  @ApiProperty({ description: 'Release ID', required: false })
  releaseId?: string;

  @ApiProperty({ description: 'Release version', required: false })
  version?: string;

  @ApiProperty({ description: 'Number of recipients targeted' })
  recipientCount: number;

  @ApiProperty({ description: 'Number of emails sent successfully' })
  emailsSent: number;

  @ApiProperty({ description: 'Number of emails that failed' })
  emailsFailed: number;

  @ApiProperty({ description: 'Number of in-app notifications sent' })
  inAppSent: number;

  @ApiProperty({ description: 'Number of users skipped' })
  skippedUsers: number;

  @ApiProperty({ description: 'Whether this was a dry run' })
  dryRun: boolean;

  @ApiProperty({
    description: 'Error message if operation failed',
    required: false,
  })
  error?: string;

  @ApiProperty({
    description: 'Per-recipient results (only in dry run or on request)',
    type: [RecipientResultDto],
    required: false,
  })
  recipients?: RecipientResultDto[];
}

@ApiTags('Releases')
@Controller('releases')
export class ReleasesController {
  constructor(
    private readonly releaseNotificationsService: ReleaseNotificationsService,
    private readonly releaseChangelogService: ReleaseChangelogService
  ) {}

  @Get()
  @ApiOkResponse({
    description: 'List of releases',
    type: ReleaseListItemDto,
    isArray: true,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of releases to return (default: 20, max: 100)',
    schema: { type: 'number', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Number of releases to skip (for pagination)',
    schema: { type: 'number', minimum: 0, default: 0 },
  })
  @ApiStandardErrors({ unauthorized: false, forbidden: false })
  async list(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number
  ): Promise<ReleaseListItemDto[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const releases = await this.releaseNotificationsService.getReleases(
      safeLimit,
      offset
    );

    return releases.map((release) => ({
      id: release.id,
      version: release.version,
      commitCount: release.commitCount,
      status: release.status,
      createdAt: release.createdAt,
    }));
  }

  @Post()
  @ApiCreatedResponse({
    description: 'Release created successfully',
    type: CreateReleaseResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid request or no commits found',
  })
  @ApiStandardErrors({ unauthorized: false, forbidden: false })
  async create(
    @Body() dto: CreateReleaseDto
  ): Promise<CreateReleaseResponseDto> {
    try {
      const changelog = await this.releaseChangelogService.generateChangelog({
        fromCommit: dto.fromCommit,
        toCommit: dto.toCommit,
        since: dto.since,
        until: dto.until,
        rawCommits: dto.rawCommits,
      });

      const result = await this.releaseNotificationsService.createRelease(
        changelog
      );

      return result;
    } catch (error) {
      const err = error as Error;
      throw new BadRequestException({
        error: {
          code: 'bad_request',
          message: err.message,
        },
      });
    }
  }

  @Post('preview')
  @ApiOkResponse({
    description: 'Preview commits for a date range without creating a release',
    type: PreviewReleaseResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid date range or no commits found',
  })
  @ApiStandardErrors({ unauthorized: false, forbidden: false })
  async preview(
    @Body() dto: PreviewReleaseDto
  ): Promise<PreviewReleaseResponseDto> {
    try {
      const result = await this.releaseChangelogService.generateChangelog({
        since: dto.since,
        until: dto.until,
        rawCommits: dto.rawCommits ?? true,
      });

      return {
        version: result.version,
        commitCount: result.commitCount,
        fromCommit: result.fromCommit,
        toCommit: result.toCommit,
        commits: result.commits.map((c) => ({
          hash: c.hash,
          shortHash: c.shortHash,
          subject: c.subject,
          body: c.body,
          authorName: c.authorName,
          authorEmail: c.authorEmail,
          date: c.date,
        })),
        changelog: result.changelog,
      };
    } catch (error) {
      const err = error as Error;
      throw new BadRequestException({
        error: {
          code: 'bad_request',
          message: err.message,
        },
      });
    }
  }

  @Get('latest')
  @ApiOkResponse({
    description: 'Latest release details',
    type: ReleaseDetailDto,
  })
  @ApiNotFoundResponse({
    description: 'No releases found',
  })
  @ApiStandardErrors({ unauthorized: false, forbidden: false })
  async getLatest(): Promise<ReleaseDetailDto> {
    const release = await this.releaseNotificationsService.getLatestRelease();

    if (!release) {
      throw new NotFoundException({
        error: {
          code: 'not_found',
          message: 'No releases found',
        },
      });
    }

    return this.mapToDetailDto(release);
  }

  @Get(':version')
  @ApiOkResponse({
    description: 'Release details',
    type: ReleaseDetailDto,
  })
  @ApiNotFoundResponse({
    description: 'Release not found',
  })
  @ApiParam({
    name: 'version',
    description: 'Release version (e.g., v2025.12.19)',
    example: 'v2025.12.19',
  })
  @ApiStandardErrors({ unauthorized: false, forbidden: false })
  async getByVersion(
    @Param('version') version: string
  ): Promise<ReleaseDetailDto> {
    const release = await this.releaseNotificationsService.getReleaseByVersion(
      version
    );

    if (!release) {
      throw new NotFoundException({
        error: {
          code: 'not_found',
          message: `Release ${version} not found`,
        },
      });
    }

    return this.mapToDetailDto(release);
  }

  @Delete(':version')
  @ApiOkResponse({
    description: 'Release deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Release not found',
  })
  @ApiBadRequestResponse({
    description: 'Cannot delete published release',
  })
  @ApiParam({
    name: 'version',
    description: 'Release version (e.g., v2025.12.19)',
    example: 'v2025.12.19',
  })
  @ApiStandardErrors({ unauthorized: false, forbidden: false })
  async deleteRelease(
    @Param('version') version: string
  ): Promise<{ success: boolean }> {
    const result = await this.releaseNotificationsService.deleteRelease(
      version
    );

    if (!result.success) {
      if (result.error?.includes('not found')) {
        throw new NotFoundException({
          error: {
            code: 'not_found',
            message: result.error,
          },
        });
      }
      throw new BadRequestException({
        error: {
          code: 'bad_request',
          message: result.error,
        },
      });
    }

    return { success: true };
  }

  @Get(':version/email-preview')
  @ApiOkResponse({
    description: 'Rendered email HTML preview',
    schema: {
      type: 'object',
      properties: {
        html: { type: 'string', description: 'Rendered email HTML' },
        version: { type: 'string', description: 'Release version' },
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'Release not found',
  })
  @ApiParam({
    name: 'version',
    description: 'Release version (e.g., v2025.12.19)',
    example: 'v2025.12.19',
  })
  @ApiQuery({
    name: 'recipientName',
    required: false,
    description: 'Name to use in email greeting (default: "User")',
  })
  @ApiStandardErrors({ unauthorized: false, forbidden: false })
  async getEmailPreview(
    @Param('version') version: string,
    @Query('recipientName') recipientName?: string
  ): Promise<{ html: string; version: string }> {
    const result = await this.releaseNotificationsService.renderEmailPreview(
      version,
      recipientName
    );

    if (!result) {
      throw new NotFoundException({
        error: {
          code: 'not_found',
          message: `Release ${version} not found`,
        },
      });
    }

    return result;
  }

  @Post(':version/send')
  @ApiOkResponse({
    description: 'Notifications sent successfully',
    type: SendNotificationsResponseDto,
  })
  @ApiNotFoundResponse({
    description: 'Release not found',
  })
  @ApiBadRequestResponse({
    description: 'Invalid targeting options',
  })
  @ApiParam({
    name: 'version',
    description: 'Release version or ID',
    example: 'v2025.12.19',
  })
  @ApiStandardErrors({ unauthorized: false, forbidden: false })
  async sendNotifications(
    @Param('version') version: string,
    @Body() dto: SendNotificationsDto
  ): Promise<SendNotificationsResponseDto> {
    const result =
      await this.releaseNotificationsService.sendNotificationsForRelease(
        version,
        {
          userId: dto.userId,
          projectId: dto.projectId,
          allUsers: dto.allUsers,
          dryRun: dto.dryRun,
          force: dto.force,
          resend: dto.resend,
        }
      );

    if (!result.success && result.error?.includes('not found')) {
      throw new NotFoundException({
        error: {
          code: 'not_found',
          message: result.error,
        },
      });
    }

    return result;
  }

  private mapToDetailDto(release: any): ReleaseDetailDto {
    return {
      id: release.id,
      version: release.version,
      fromCommit: release.fromCommit,
      toCommit: release.toCommit,
      commitCount: release.commitCount,
      status: release.status,
      changelogJson: release.changelogJson,
      createdAt: release.createdAt,
    };
  }
}

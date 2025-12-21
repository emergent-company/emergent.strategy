import {
  Controller,
  Get,
  Param,
  Query,
  NotFoundException,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { ApiStandardErrors } from '../../common/decorators/api-standard-errors';
import { ReleaseNotificationsService } from './services/release-notifications.service';

/**
 * DTO for release list item (minimal data for list view)
 */
class ReleaseListItemDto {
  id: string;
  version: string;
  commitCount: number;
  createdAt: Date;
}

/**
 * DTO for full release details
 */
class ReleaseDetailDto {
  id: string;
  version: string;
  fromCommit: string;
  toCommit: string;
  commitCount: number;
  changelogJson: {
    summary: string;
    features: string[];
    improvements: string[];
    bugFixes: string[];
    breakingChanges: string[];
    otherChanges: string[];
  } | null;
  createdAt: Date;
}

/**
 * Releases Controller
 *
 * Public endpoints for viewing release information.
 * No authentication required - these are public release notes.
 */
@ApiTags('Releases')
@Controller('releases')
export class ReleasesController {
  constructor(
    private readonly releaseNotificationsService: ReleaseNotificationsService
  ) {}

  /**
   * List all releases with pagination.
   */
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
    // Cap limit at 100
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const releases = await this.releaseNotificationsService.getReleases(
      safeLimit,
      offset
    );

    return releases.map((release) => ({
      id: release.id,
      version: release.version,
      commitCount: release.commitCount,
      createdAt: release.createdAt,
    }));
  }

  /**
   * Get the latest release.
   */
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

  /**
   * Get a specific release by version.
   */
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
    description: 'Release version (e.g., v2024.12.19)',
    example: 'v2024.12.19',
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

  /**
   * Map a release entity to the detail DTO.
   */
  private mapToDetailDto(release: any): ReleaseDetailDto {
    return {
      id: release.id,
      version: release.version,
      fromCommit: release.fromCommit,
      toCommit: release.toCommit,
      commitCount: release.commitCount,
      changelogJson: release.changelogJson,
      createdAt: release.createdAt,
    };
  }
}

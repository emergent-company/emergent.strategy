import {
  Controller,
  Post,
  Get,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Scopes } from '../auth/scopes.decorator';
import { UserDeletionService, DeletionResult } from './user-deletion.service';
import { UserAccessService } from './user-access.service';
import { OrgWithProjectsDto } from './dto/user-access.dto';

/**
 * Controller for user-related endpoints.
 *
 * Endpoints:
 * - GET /user/orgs-and-projects - Get user's access tree (orgs + projects with roles)
 * - POST /user/delete-account - Delete authenticated user's account and all data
 * - POST /user/test-cleanup - Delete test user data (test environments only)
 */
@ApiTags('user')
@Controller('user')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class UserDeletionController {
  private readonly logger = new Logger(UserDeletionController.name);

  constructor(
    private readonly deletionService: UserDeletionService,
    private readonly accessService: UserAccessService
  ) {}

  /**
   * Get the complete access tree for the authenticated user.
   *
   * Returns all organizations and projects the user has access to, including:
   * - User's role in each organization (org_admin, org_member, etc.)
   * - User's role in each project (project_admin, project_member, etc.)
   * - Projects nested under their parent organizations
   *
   * This endpoint replaces the need for separate calls to GET /orgs and GET /projects.
   */
  @Get('orgs-and-projects')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get user access tree (organizations and projects with roles)',
    description:
      'Returns hierarchical access tree with orgs and nested projects, including user roles at each level',
  })
  @ApiOkResponse({
    description: 'Access tree retrieved successfully',
    type: [OrgWithProjectsDto],
    schema: {
      example: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          name: 'Acme Corp',
          role: 'org_admin',
          projects: [
            {
              id: '550e8400-e29b-41d4-a716-446655440001',
              name: 'Product Docs',
              orgId: '550e8400-e29b-41d4-a716-446655440000',
              role: 'project_admin',
            },
          ],
        },
      ],
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getOrgsAndProjects(@Request() req: any): Promise<OrgWithProjectsDto[]> {
    const userId = req.user?.id; // Use internal UUID, not external sub

    if (!userId) {
      throw new ForbiddenException('User ID not found in request');
    }

    return this.accessService.getAccessTree(userId);
  }

  /**
   * Delete the authenticated user's account and all associated data.
   *
   * This is a destructive operation that:
   * - Deletes all organizations owned by the user
   * - Deletes all projects in those organizations
   * - Deletes all documents, chunks, embeddings
   * - Deletes all extraction jobs, graph data, integrations
   *
   * Note: This does NOT delete the Zitadel user account itself (only application data).
   * The user will need to contact support to fully delete their Zitadel account.
   */
  @Post('delete-account')
  @HttpCode(HttpStatus.OK)
  @Scopes('account:delete')
  @ApiOperation({ summary: 'Delete user account and all data' })
  @ApiResponse({
    status: 200,
    description: 'Account deleted successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        deleted: {
          type: 'object',
          properties: {
            organizations: { type: 'number' },
            projects: { type: 'number' },
            documents: { type: 'number' },
            chunks: { type: 'number' },
            embeddings: { type: 'number' },
            extractionJobs: { type: 'number' },
            graphObjects: { type: 'number' },
            integrations: { type: 'number' },
          },
        },
        duration_ms: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async deleteAccount(
    @Request() req: any
  ): Promise<{ message: string } & DeletionResult> {
    const userId = req.user?.sub;

    if (!userId) {
      throw new ForbiddenException('User ID not found in token');
    }

    this.logger.warn(`User ${userId} initiated account deletion`);

    const result = await this.deletionService.deleteUserData(userId);

    this.logger.warn(
      `Account deletion complete for user ${userId}: ${JSON.stringify(result)}`
    );

    return {
      message: 'Account and all associated data deleted successfully',
      ...result,
    };
  }

  /**
   * Delete test user data (test environments only).
   *
   * This endpoint is used for E2E test cleanup. It:
   * - Only works in non-production environments
   * - Only allows deletion for test email patterns
   * - Provides detailed statistics about what was deleted
   *
   * Used by E2E tests to clean up between test runs.
   */
  @Post('test-cleanup')
  @HttpCode(HttpStatus.OK)
  @Scopes('account:delete')
  @ApiOperation({ summary: 'Clean up test user data (test environments only)' })
  @ApiResponse({
    status: 200,
    description: 'Test data cleaned up successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - not a test environment or test user',
  })
  async testCleanup(
    @Request() req: any
  ): Promise<{ message: string } & DeletionResult> {
    const userId = req.user?.sub;
    const userEmail = req.user?.email || req.user?.preferred_username;

    this.logger.log(
      `[TEST-CLEANUP] Request user object: ${JSON.stringify(
        {
          id: req.user?.id,
          sub: req.user?.sub,
          email: req.user?.email,
          emailType: typeof req.user?.email,
          emailIsUndefined: req.user?.email === undefined,
          preferred_username: req.user?.preferred_username,
          scopes: req.user?.scopes,
          allKeys: Object.keys(req.user || {}),
          fullUser: req.user,
        },
        null,
        2
      )}`
    );

    if (!userId) {
      throw new ForbiddenException('User ID not found in token');
    }

    // Safety check: Only allow in test environments
    if (!this.deletionService.isTestEnvironment()) {
      throw new ForbiddenException(
        'Test cleanup only available in non-production environments'
      );
    }

    // Safety check: Only allow test emails
    if (!this.deletionService.isTestEmail(userEmail)) {
      throw new ForbiddenException(
        `Email ${userEmail} does not match test patterns. Only test accounts can use this endpoint.`
      );
    }

    this.logger.log(`Test cleanup initiated for user ${userId} (${userEmail})`);

    const result = await this.deletionService.deleteUserData(userId);

    this.logger.log(
      `Test cleanup complete for ${userEmail}: ${JSON.stringify(result)}`
    );

    return {
      message: 'Test data cleaned up successfully',
      ...result,
    };
  }
}

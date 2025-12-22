import {
  createParamDecorator,
  ExecutionContext,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Project context extracted from request headers.
 * Used by controllers that need tenant context from x-project-id and x-org-id headers.
 */
export interface ProjectContext {
  /** The project ID from x-project-id header (always present when using RequireProjectId) */
  projectId: string;
  /** The organization ID from x-org-id header (optional unless requireOrg is true) */
  orgId?: string;
}

/**
 * Options for the RequireProjectId decorator.
 */
export interface ProjectContextOptions {
  /** If true, x-org-id header is also required */
  requireOrg?: boolean;
}

/**
 * Parameter decorator that extracts and validates project context from request headers.
 *
 * Eliminates duplicated header extraction and validation across controllers.
 * Throws BadRequestException with standardized error format if required headers are missing.
 *
 * @example
 * // Basic usage - requires only x-project-id
 * @Get()
 * async list(@RequireProjectId() ctx: ProjectContext) {
 *   return this.service.list(ctx.projectId);
 * }
 *
 * @example
 * // Require both x-project-id and x-org-id
 * @Post()
 * async create(@RequireProjectId({ requireOrg: true }) ctx: ProjectContext) {
 *   return this.service.create(ctx.projectId, ctx.orgId!);
 * }
 */
export const RequireProjectId = createParamDecorator(
  (
    options: ProjectContextOptions = {},
    ctx: ExecutionContext
  ): ProjectContext => {
    const request = ctx.switchToHttp().getRequest();
    const projectId = request.headers['x-project-id'] as string | undefined;
    const orgId = request.headers['x-org-id'] as string | undefined;

    if (!projectId) {
      throw new BadRequestException({
        error: { code: 'bad-request', message: 'x-project-id header required' },
      });
    }

    if (options.requireOrg && !orgId) {
      throw new BadRequestException({
        error: { code: 'bad-request', message: 'x-org-id header required' },
      });
    }

    return { projectId, orgId };
  }
);

/**
 * Parameter decorator that extracts project context from request headers without validation.
 * Returns undefined values if headers are not present or invalid.
 *
 * Normalizes header values:
 * - Trims whitespace
 * - Treats "null" and "undefined" strings as undefined
 * - Returns undefined for empty strings
 *
 * Use this when project context is optional for the endpoint.
 *
 * @example
 * @Get()
 * async list(@OptionalProjectId() ctx: OptionalProjectContext) {
 *   if (ctx.projectId) {
 *     return this.service.listForProject(ctx.projectId);
 *   }
 *   return this.service.listAll();
 * }
 */
export interface OptionalProjectContext {
  projectId?: string;
  orgId?: string;
}

/**
 * Normalizes a header value by trimming and filtering out invalid strings.
 */
function normalizeHeaderValue(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (
    !trimmed ||
    trimmed.toLowerCase() === 'null' ||
    trimmed.toLowerCase() === 'undefined'
  ) {
    return undefined;
  }
  return trimmed;
}

export const OptionalProjectId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OptionalProjectContext => {
    const request = ctx.switchToHttp().getRequest();
    return {
      projectId: normalizeHeaderValue(
        request.headers['x-project-id'] as string | undefined
      ),
      orgId: normalizeHeaderValue(
        request.headers['x-org-id'] as string | undefined
      ),
    };
  }
);

/**
 * Parameter decorator that extracts and validates user ID from the authenticated request.
 *
 * Eliminates duplicated user extraction and auth checking across controllers.
 * Throws ForbiddenException if user is not authenticated.
 *
 * @example
 * @Get()
 * async getProfile(@RequireUserId() userId: string) {
 *   return this.service.getProfile(userId);
 * }
 *
 * @example
 * // Combined with project context
 * @Post()
 * async create(
 *   @RequireUserId() userId: string,
 *   @RequireProjectId() ctx: ProjectContext
 * ) {
 *   return this.service.create(userId, ctx.projectId);
 * }
 */
export const RequireUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    return userId;
  }
);

/**
 * User subject context containing the external Zitadel subject ID and email.
 * Used by user management endpoints that need to interact with the auth provider.
 */
export interface UserSubjectContext {
  /** External Zitadel subject ID (sub claim from token) */
  subject: string;
  /** User email from token (may be undefined for machine users) */
  email?: string;
}

/**
 * Parameter decorator that extracts the user's external subject ID from the authenticated request.
 *
 * Use this for endpoints that need to interact with Zitadel or need the external identity
 * rather than the internal database UUID.
 *
 * @example
 * @Post('delete-account')
 * async deleteAccount(@RequireUserSubject() user: UserSubjectContext) {
 *   return this.deletionService.deleteUserData(user.subject);
 * }
 */
export const RequireUserSubject = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserSubjectContext => {
    const request = ctx.switchToHttp().getRequest();
    const subject = request.user?.sub;

    if (!subject) {
      throw new ForbiddenException('User ID not found in token');
    }

    return {
      subject,
      email: request.user?.email || request.user?.preferred_username,
    };
  }
);

import {
  createParamDecorator,
  ExecutionContext,
  BadRequestException,
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
 * Returns undefined values if headers are not present.
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

export const OptionalProjectId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OptionalProjectContext => {
    const request = ctx.switchToHttp().getRequest();
    return {
      projectId: request.headers['x-project-id'] as string | undefined,
      orgId: request.headers['x-org-id'] as string | undefined,
    };
  }
);

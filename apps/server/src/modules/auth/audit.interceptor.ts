import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { AuditEventType, AuditOutcome } from './audit.types';
import { ViewAsUser } from '../../common/middleware/view-as.middleware';

/**
 * Audit interceptor for authorization events.
 * Supports view-as impersonation: logs both superadminUser (actor) and viewAsUser (context).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);
  private readonly enabled: boolean;

  constructor(private readonly auditService: AuditService) {
    this.enabled = process.env.AUDIT_INTERCEPTOR_ENABLED !== 'false'; // Default enabled
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (!this.enabled) {
      return next.handle();
    }

    const req = context.switchToHttp().getRequest<any>();
    const res = context.switchToHttp().getResponse<any>();
    const user = req.user;

    const superadminUser = req.superadminUser;
    const viewAsUser: ViewAsUser | undefined = req.viewAsUser;
    const isViewAs = !!superadminUser && !!viewAsUser;

    const effectiveUserId = isViewAs ? viewAsUser.id : user?.sub;
    const effectiveUserEmail = isViewAs ? undefined : user?.email;

    const requestData = {
      endpoint: req.route?.path || req.url,
      httpMethod: req.method,
      userId: effectiveUserId,
      userEmail: effectiveUserEmail,
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
      requestId: req.headers['x-request-id'] || req.id,
      superadminUserId: isViewAs ? superadminUser.sub : undefined,
      viewAsUserId: isViewAs ? viewAsUser.id : undefined,
    };

    return next.handle().pipe(
      tap({
        next: () => {
          // Log successful request
          this.logSuccess(requestData, res.statusCode);
        },
        error: (error: any) => {
          // Log failed request
          this.logFailure(requestData, error);
        },
      })
    );
  }

  private logSuccess(data: any, statusCode: number): void {
    // Determine event type based on HTTP method
    let eventType: AuditEventType;
    switch (data.httpMethod) {
      case 'GET':
        eventType = AuditEventType.RESOURCE_READ;
        break;
      case 'POST':
        eventType = AuditEventType.RESOURCE_CREATE;
        break;
      case 'PUT':
      case 'PATCH':
        eventType = AuditEventType.RESOURCE_UPDATE;
        break;
      case 'DELETE':
        eventType = AuditEventType.RESOURCE_DELETE;
        break;
      default:
        eventType = AuditEventType.RESOURCE_READ;
    }

    // Special handling for search and graph endpoints
    if (data.endpoint.includes('/search')) {
      eventType = AuditEventType.SEARCH_QUERY;
    } else if (data.endpoint.includes('/graph/traverse')) {
      eventType = AuditEventType.GRAPH_TRAVERSE;
    } else if (data.endpoint.includes('/graph/search')) {
      eventType = AuditEventType.GRAPH_SEARCH;
    }

    this.auditService
      .logResourceAccess({
        eventType,
        userId: data.userId,
        userEmail: data.userEmail,
        resourceType: this.extractResourceType(data.endpoint),
        action: `${data.httpMethod} ${data.endpoint}`,
        endpoint: data.endpoint,
        httpMethod: data.httpMethod,
        outcome: AuditOutcome.SUCCESS,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        requestId: data.requestId,
        metadata: {
          status_code: statusCode,
          ...(data.superadminUserId && {
            superadmin_user_id: data.superadminUserId,
          }),
          ...(data.viewAsUserId && { view_as_user_id: data.viewAsUserId }),
        },
      })
      .catch((err) => {
        // Silent failure - audit logging must not break application
        this.logger.error('Failed to log success audit', err);
      });
  }

  private logFailure(data: any, error: any): void {
    const eventType =
      error.status === 403
        ? AuditEventType.AUTHZ_DENIED
        : AuditEventType.RESOURCE_READ;

    const outcome =
      error.status === 403 ? AuditOutcome.DENIED : AuditOutcome.FAILURE;

    this.auditService
      .logResourceAccess({
        eventType,
        userId: data.userId,
        userEmail: data.userEmail,
        resourceType: this.extractResourceType(data.endpoint),
        action: `${data.httpMethod} ${data.endpoint}`,
        endpoint: data.endpoint,
        httpMethod: data.httpMethod,
        outcome,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        requestId: data.requestId,
        metadata: {
          error_message: error.message,
          error_code: error.response?.error?.code || error.status,
          status_code: error.status,
          ...(data.superadminUserId && {
            superadmin_user_id: data.superadminUserId,
          }),
          ...(data.viewAsUserId && { view_as_user_id: data.viewAsUserId }),
        },
      })
      .catch((err) => {
        this.logger.error('Failed to log failure audit', err);
      });
  }

  /**
   * Extract resource type from endpoint path
   */
  private extractResourceType(endpoint: string): string {
    const parts = endpoint.split('/').filter((p) => p && !p.startsWith(':'));
    if (parts.length > 0) {
      // Return first meaningful path segment as resource type
      return parts[0];
    }
    return 'unknown';
  }
}

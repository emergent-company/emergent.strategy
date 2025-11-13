/**
 * Redaction Interceptor (Phase 3 - Task 8a)
 *
 * Automatically redacts sensitive fields from API responses based on user permissions.
 * Integrates with the audit trail to log redaction events.
 */

import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  Optional,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  redactGraphObject,
  redactGraphObjects,
  createRedactionConfig,
  RedactionConfig,
} from '../graph/utils/redaction.util';
import { AuditService } from '../auth/audit.service';
import { AuditEventType, AuditOutcome } from '../auth/audit.types';

/**
 * Configuration for redaction interceptor behavior.
 * Set via environment variables.
 */
interface RedactionInterceptorConfig {
  /** Whether redaction is enabled (default: true) */
  enabled: boolean;
  /** Whether to log redaction events (default: true) */
  logRedactions: boolean;
  /** Whether to enable pattern-based redaction (default: true) */
  enablePatternRedaction: boolean;
  /** Whether to enable metadata-based redaction (default: true) */
  enableMetadataRedaction: boolean;
}

/**
 * Load interceptor configuration from environment variables.
 */
function loadConfig(): RedactionInterceptorConfig {
  return {
    enabled: process.env.REDACTION_ENABLED !== 'false',
    logRedactions: process.env.REDACTION_LOG_EVENTS !== 'false',
    enablePatternRedaction: process.env.REDACTION_PATTERN_ENABLED !== 'false',
    enableMetadataRedaction: process.env.REDACTION_METADATA_ENABLED !== 'false',
  };
}

@Injectable()
export class RedactionInterceptor implements NestInterceptor {
  private readonly config: RedactionInterceptorConfig;

  constructor(
    @Optional() @Inject(AuditService) private readonly audit?: AuditService
  ) {
    this.config = loadConfig();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Skip if redaction disabled
    if (!this.config.enabled) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Create redaction config from user context
    const redactionConfig: RedactionConfig = {
      ...createRedactionConfig(user),
      enablePatternRedaction: this.config.enablePatternRedaction,
      enableMetadataRedaction: this.config.enableMetadataRedaction,
      logRedactions: this.config.logRedactions,
    };

    return next.handle().pipe(
      map((data) => {
        // Skip redaction for non-object responses
        if (!data || typeof data !== 'object') {
          return data;
        }

        try {
          const redactedData = this.redactResponseData(data, redactionConfig);

          // Log redaction event if any fields were redacted
          if (this.config.logRedactions && redactedData.redactionCount > 0) {
            this.logRedactionEvent(
              request,
              user,
              redactedData.redactionCount,
              redactedData.redactedFields
            );
          }

          return redactedData.data;
        } catch (error) {
          // Never fail request due to redaction error
          // Log error and return original data
          console.error('[RedactionInterceptor] Redaction failed:', error);
          return data;
        }
      })
    );
  }

  /**
   * Redact sensitive data from response.
   */
  private redactResponseData(
    data: any,
    config: RedactionConfig
  ): { data: any; redactionCount: number; redactedFields: string[] } {
    // Handle array responses
    if (Array.isArray(data)) {
      // Check if it's an array of graph objects
      if (data.length > 0 && this.isGraphObject(data[0])) {
        return redactGraphObjects(data, config);
      }

      // Generic array handling
      const results = data.map((item) => this.redactResponseData(item, config));
      return {
        data: results.map((r) => r.data),
        redactionCount: results.reduce((sum, r) => sum + r.redactionCount, 0),
        redactedFields: results.flatMap((r) => r.redactedFields),
      };
    }

    // Handle graph object response
    if (this.isGraphObject(data)) {
      return redactGraphObject(data, config);
    }

    // Handle wrapped responses (e.g., { items: [...], total: 10 })
    if (data.items && Array.isArray(data.items)) {
      const itemsResult = this.redactResponseData(data.items, config);
      return {
        data: {
          ...data,
          items: itemsResult.data,
        },
        redactionCount: itemsResult.redactionCount,
        redactedFields: itemsResult.redactedFields,
      };
    }

    // Handle graph traversal results
    if (data.nodes && Array.isArray(data.nodes)) {
      const nodesResult = redactGraphObjects(data.nodes, config);
      return {
        data: {
          ...data,
          nodes: nodesResult.data,
        },
        redactionCount: nodesResult.redactionCount,
        redactedFields: nodesResult.redactedFields,
      };
    }

    // No redaction needed
    return {
      data,
      redactionCount: 0,
      redactedFields: [],
    };
  }

  /**
   * Check if an object looks like a graph object.
   */
  private isGraphObject(obj: any): boolean {
    return (
      obj &&
      typeof obj === 'object' &&
      'id' in obj &&
      'type' in obj &&
      'properties' in obj
    );
  }

  /**
   * Log redaction event to audit trail.
   */
  private logRedactionEvent(
    request: any,
    user: any,
    redactionCount: number,
    redactedFields: string[]
  ): void {
    if (!this.audit) {
      return;
    }

    try {
      this.audit
        .log({
          timestamp: new Date(),
          event_type: AuditEventType.RESOURCE_READ,
          outcome: AuditOutcome.SUCCESS,
          user_id: user?.sub,
          user_email: user?.email,
          endpoint: request.route?.path || request.url,
          http_method: request.method,
          action: `${request.method} ${request.route?.path || request.url}`,
          status_code: 200,
          ip_address: request.ip || request.connection?.remoteAddress,
          user_agent: request.headers['user-agent'],
          request_id: request.headers['x-request-id'] || request.id,
          metadata: {
            redaction_applied: true,
            redaction_count: redactionCount,
            redacted_fields: redactedFields.slice(0, 50), // Limit to first 50 for log size
          },
        })
        .catch(() => {
          /* silent failure */
        });
    } catch {
      // Never throw from audit logging
    }
  }
}

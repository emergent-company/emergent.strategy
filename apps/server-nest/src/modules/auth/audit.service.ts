import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../../entities/audit-log.entity';
import {
  AuditLogEntry,
  AuditLogEntryMinimal,
  AuditEventType,
  AuditOutcome,
} from './audit.types';

/**
 * Phase 3: Authorization Audit Trail (6a)
 *
 * Service for logging authorization and access events for compliance and security analysis.
 * Provides both database persistence and structured logging.
 *
 * Migrated to TypeORM - uses Repository for INSERT, QueryBuilder for dynamic SELECT
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly enableDatabaseLogging: boolean;
  private readonly enableConsoleLogging: boolean;

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>
  ) {
    // Configuration from environment
    this.enableDatabaseLogging = process.env.AUDIT_DATABASE_LOGGING !== 'false'; // Default enabled
    this.enableConsoleLogging = process.env.AUDIT_CONSOLE_LOGGING === 'true'; // Default disabled
  }

  /**
   * Log a full audit entry with all details
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      // Console logging for development/debugging
      if (this.enableConsoleLogging) {
        this.logger.log({
          type: 'audit',
          ...entry,
          timestamp: entry.timestamp.toISOString(),
        });
      }

      // Database persistence for production audit trail
      if (this.enableDatabaseLogging) {
        await this.persistToDatabase(entry);
      }
    } catch (error) {
      // Never throw - audit logging must not break application flow
      this.logger.error('Failed to log audit entry', error);
    }
  }

  /**
   * Log a minimal audit entry (lightweight)
   */
  async logMinimal(entry: AuditLogEntryMinimal): Promise<void> {
    const fullEntry: AuditLogEntry = {
      ...entry,
      action: entry.action,
      endpoint: entry.endpoint,
      http_method: entry.http_method,
    };
    await this.log(fullEntry);
  }

  /**
   * Log successful authorization
   */
  async logAuthzAllowed(params: {
    userId?: string;
    userEmail?: string;
    endpoint: string;
    httpMethod: string;
    action: string;
    requiredScopes: string[];
    effectiveScopes: string[];
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
  }): Promise<void> {
    await this.log({
      timestamp: new Date(),
      event_type: AuditEventType.AUTHZ_ALLOWED,
      outcome: AuditOutcome.SUCCESS,
      user_id: params.userId,
      user_email: params.userEmail,
      action: params.action,
      endpoint: params.endpoint,
      http_method: params.httpMethod,
      required_scopes: params.requiredScopes,
      effective_scopes: params.effectiveScopes,
      ip_address: params.ipAddress,
      user_agent: params.userAgent,
      request_id: params.requestId,
    });
  }

  /**
   * Log denied authorization
   */
  async logAuthzDenied(params: {
    userId?: string;
    userEmail?: string;
    endpoint: string;
    httpMethod: string;
    action: string;
    requiredScopes: string[];
    effectiveScopes?: string[];
    missingScopes: string[];
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
    statusCode?: number;
  }): Promise<void> {
    await this.log({
      timestamp: new Date(),
      event_type: AuditEventType.AUTHZ_DENIED,
      outcome: AuditOutcome.DENIED,
      user_id: params.userId,
      user_email: params.userEmail,
      action: params.action,
      endpoint: params.endpoint,
      http_method: params.httpMethod,
      required_scopes: params.requiredScopes,
      effective_scopes: params.effectiveScopes,
      missing_scopes: params.missingScopes,
      ip_address: params.ipAddress,
      user_agent: params.userAgent,
      request_id: params.requestId,
      status_code: params.statusCode || 403,
      error_code: 'forbidden',
      error_message: 'Missing required scopes',
    });
  }

  /**
   * Log resource access
   */
  async logResourceAccess(params: {
    eventType: AuditEventType;
    userId?: string;
    userEmail?: string;
    resourceType: string;
    resourceId?: string;
    action: string;
    endpoint: string;
    httpMethod: string;
    outcome: AuditOutcome;
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    requestId?: string;
  }): Promise<void> {
    await this.log({
      timestamp: new Date(),
      event_type: params.eventType,
      outcome: params.outcome,
      user_id: params.userId,
      user_email: params.userEmail,
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      action: params.action,
      endpoint: params.endpoint,
      http_method: params.httpMethod,
      metadata: params.metadata,
      ip_address: params.ipAddress,
      user_agent: params.userAgent,
      request_id: params.requestId,
    });
  }

  /**
   * Persist audit entry to database - Migrated to TypeORM Repository
   */
  private async persistToDatabase(entry: AuditLogEntry): Promise<void> {
    try {
      // Create audit log entry using TypeORM
      const auditEntry = this.auditLogRepo.create({
        timestamp: entry.timestamp,
        eventType: entry.event_type,
        outcome: entry.outcome,
        userId: entry.user_id ?? undefined,
        userEmail: entry.user_email ?? undefined,
        resourceType: entry.resource_type ?? undefined,
        resourceId: entry.resource_id ?? undefined,
        action: entry.action,
        endpoint: entry.endpoint,
        httpMethod: entry.http_method,
        statusCode: entry.status_code ?? undefined,
        errorCode: entry.error_code ?? undefined,
        errorMessage: entry.error_message ?? undefined,
        ipAddress: entry.ip_address ?? undefined,
        userAgent: entry.user_agent ?? undefined,
        requestId: entry.request_id ?? undefined,
        details: {
          required_scopes: entry.required_scopes,
          effective_scopes: entry.effective_scopes,
          missing_scopes: entry.missing_scopes,
          metadata: entry.metadata,
        },
      });

      await this.auditLogRepo.save(auditEntry);
    } catch (error) {
      // Log error but don't throw
      this.logger.error('Failed to persist audit entry to database', error);
    }
  }

  /**
   * Query audit logs (for admin/compliance interfaces) - Migrated to TypeORM QueryBuilder
   */
  async queryLogs(params: {
    userId?: string;
    eventType?: AuditEventType;
    outcome?: AuditOutcome;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AuditLogEntry[]> {
    const queryBuilder = this.auditLogRepo.createQueryBuilder('audit');

    if (params.userId) {
      queryBuilder.andWhere('audit.userId = :userId', {
        userId: params.userId,
      });
    }
    if (params.eventType) {
      queryBuilder.andWhere('audit.eventType = :eventType', {
        eventType: params.eventType,
      });
    }
    if (params.outcome) {
      queryBuilder.andWhere('audit.outcome = :outcome', {
        outcome: params.outcome,
      });
    }
    if (params.startDate) {
      queryBuilder.andWhere('audit.timestamp >= :startDate', {
        startDate: params.startDate,
      });
    }
    if (params.endDate) {
      queryBuilder.andWhere('audit.timestamp <= :endDate', {
        endDate: params.endDate,
      });
    }

    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;

    const rows = await queryBuilder
      .orderBy('audit.timestamp', 'DESC')
      .limit(limit)
      .offset(offset)
      .getMany();

    return rows.map((row) => this.entityToAuditEntry(row));
  }

  /**
   * Convert entity to AuditLogEntry
   */
  private entityToAuditEntry(entity: AuditLog): AuditLogEntry {
    const details = entity.details || {};

    return {
      timestamp: entity.timestamp,
      event_type: entity.eventType as AuditEventType,
      outcome: entity.outcome as AuditOutcome,
      user_id: entity.userId ?? undefined,
      user_email: entity.userEmail ?? undefined,
      resource_type: entity.resourceType ?? undefined,
      resource_id: entity.resourceId ?? undefined,
      action: entity.action,
      endpoint: entity.endpoint,
      http_method: entity.httpMethod,
      status_code: entity.statusCode ?? undefined,
      error_code: entity.errorCode ?? undefined,
      error_message: entity.errorMessage ?? undefined,
      ip_address: entity.ipAddress ?? undefined,
      user_agent: entity.userAgent ?? undefined,
      request_id: entity.requestId ?? undefined,
      required_scopes: details.required_scopes,
      effective_scopes: details.effective_scopes,
      missing_scopes: details.missing_scopes,
      metadata: details.metadata,
    };
  }
}

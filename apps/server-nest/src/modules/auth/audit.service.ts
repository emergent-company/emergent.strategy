import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AuditLogEntry, AuditLogEntryMinimal, AuditEventType, AuditOutcome } from './audit.types';

/**
 * Phase 3: Authorization Audit Trail (6a)
 * 
 * Service for logging authorization and access events for compliance and security analysis.
 * Provides both database persistence and structured logging.
 */
@Injectable()
export class AuditService {
    private readonly logger = new Logger(AuditService.name);
    private readonly enableDatabaseLogging: boolean;
    private readonly enableConsoleLogging: boolean;

    constructor(private readonly db: DatabaseService) {
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
     * Persist audit entry to database
     * Using JSONB for flexible schema and fast querying
     */
    private async persistToDatabase(entry: AuditLogEntry): Promise<void> {
        try {
            // Insert into audit_log table (will be created by migration)
            await this.db.query(
                `INSERT INTO kb.audit_log (
                    timestamp,
                    event_type,
                    outcome,
                    user_id,
                    user_email,
                    resource_type,
                    resource_id,
                    action,
                    endpoint,
                    http_method,
                    status_code,
                    error_code,
                    error_message,
                    ip_address,
                    user_agent,
                    request_id,
                    details
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
                [
                    entry.timestamp,
                    entry.event_type,
                    entry.outcome,
                    entry.user_id,
                    entry.user_email,
                    entry.resource_type,
                    entry.resource_id,
                    entry.action,
                    entry.endpoint,
                    entry.http_method,
                    entry.status_code,
                    entry.error_code,
                    entry.error_message,
                    entry.ip_address,
                    entry.user_agent,
                    entry.request_id,
                    JSON.stringify({
                        required_scopes: entry.required_scopes,
                        effective_scopes: entry.effective_scopes,
                        missing_scopes: entry.missing_scopes,
                        metadata: entry.metadata,
                    }),
                ]
            );
        } catch (error) {
            // Log error but don't throw
            this.logger.error('Failed to persist audit entry to database', error);
        }
    }

    /**
     * Query audit logs (for admin/compliance interfaces)
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
        const conditions: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (params.userId) {
            conditions.push(`user_id = $${paramIndex++}`);
            values.push(params.userId);
        }
        if (params.eventType) {
            conditions.push(`event_type = $${paramIndex++}`);
            values.push(params.eventType);
        }
        if (params.outcome) {
            conditions.push(`outcome = $${paramIndex++}`);
            values.push(params.outcome);
        }
        if (params.startDate) {
            conditions.push(`timestamp >= $${paramIndex++}`);
            values.push(params.startDate);
        }
        if (params.endDate) {
            conditions.push(`timestamp <= $${paramIndex++}`);
            values.push(params.endDate);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const limit = params.limit ?? 100;
        const offset = params.offset ?? 0;

        const { rows } = await this.db.query(
            `SELECT * FROM kb.audit_log
             ${whereClause}
             ORDER BY timestamp DESC
             LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
            [...values, limit, offset]
        );

        return rows.map((row: any) => this.rowToAuditEntry(row));
    }

    /**
     * Convert database row to AuditLogEntry
     */
    private rowToAuditEntry(row: any): AuditLogEntry {
        const details = row.details ? (typeof row.details === 'string' ? JSON.parse(row.details) : row.details) : {};

        return {
            timestamp: row.timestamp,
            event_type: row.event_type,
            outcome: row.outcome,
            user_id: row.user_id,
            user_email: row.user_email,
            resource_type: row.resource_type,
            resource_id: row.resource_id,
            action: row.action,
            endpoint: row.endpoint,
            http_method: row.http_method,
            status_code: row.status_code,
            error_code: row.error_code,
            error_message: row.error_message,
            ip_address: row.ip_address,
            user_agent: row.user_agent,
            request_id: row.request_id,
            required_scopes: details.required_scopes,
            effective_scopes: details.effective_scopes,
            missing_scopes: details.missing_scopes,
            metadata: details.metadata,
        };
    }
}

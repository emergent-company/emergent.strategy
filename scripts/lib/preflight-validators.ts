/**
 * Preflight validation functions for workspace startup
 * ====================================================
 * These validators ensure critical services are configured correctly
 * before starting the workspace.
 */

import { Client } from 'pg';

export interface ValidationResult {
    passed: boolean;
    errors: string[];
    warnings: string[];
}

interface TableCheck {
    schema: string;
    table: string;
    minColumns: number;
    critical: boolean;
}

const CRITICAL_TABLES: TableCheck[] = [
    { schema: 'kb', table: 'documents', minColumns: 7, critical: true },
    { schema: 'kb', table: 'chunks', minColumns: 5, critical: true },
    { schema: 'kb', table: 'object_extraction_jobs', minColumns: 30, critical: true },
    { schema: 'kb', table: 'graph_embedding_jobs', minColumns: 10, critical: true },
    { schema: 'kb', table: 'auth_introspection_cache', minColumns: 3, critical: true },
];

/**
 * Validate database schema has all critical tables
 */
export async function validateDatabaseSchema(dbConfig: any): Promise<ValidationResult> {
    const result: ValidationResult = {
        passed: true,
        errors: [],
        warnings: [],
    };

    let client: Client | null = null;

    try {
        client = new Client(dbConfig);
        await client.connect();

        // Check each critical table
        for (const tableCheck of CRITICAL_TABLES) {
            const queryResult = await client.query(
                `SELECT COUNT(*) as column_count
                 FROM information_schema.columns
                 WHERE table_schema = $1 AND table_name = $2`,
                [tableCheck.schema, tableCheck.table]
            );

            const columnCount = parseInt(queryResult.rows[0]?.column_count || '0');

            if (columnCount === 0) {
                result.errors.push(
                    `Missing critical table: ${tableCheck.schema}.${tableCheck.table}`
                );
                result.passed = false;
            } else if (columnCount < tableCheck.minColumns) {
                result.errors.push(
                    `Table ${tableCheck.schema}.${tableCheck.table} has insufficient columns (${columnCount}, expected ${tableCheck.minColumns}+)`
                );
                result.passed = false;
            }
        }

        // Check migration tracking
        try {
            const migrationResult = await client.query(
                `SELECT COUNT(*) as count FROM public.schema_migrations`
            );
            const migrationCount = parseInt(migrationResult.rows[0]?.count || '0');
            
            if (migrationCount === 0) {
                result.warnings.push('No migrations tracked - run: npm run db:migrate');
            }
        } catch {
            result.warnings.push('Migration tracking table missing - run: npm run db:migrate');
        }

    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        result.errors.push(`Database connection failed: ${errorMsg}`);
        result.passed = false;
    } finally {
        if (client) {
            await client.end().catch(() => {});
        }
    }

    return result;
}

/**
 * Validate Zitadel OAuth configuration
 */
export async function validateZitadelConfig(): Promise<ValidationResult> {
    const result: ValidationResult = {
        passed: true,
        errors: [],
        warnings: [],
    };

    const zitadelDomain = process.env.ZITADEL_DOMAIN;
    const oauthClientId = process.env.ZITADEL_CLIENT_ID || process.env.VITE_ZITADEL_CLIENT_ID;
    const clientJwtPath = process.env.ZITADEL_CLIENT_JWT_PATH;
    const apiJwtPath = process.env.ZITADEL_API_JWT_PATH;

    // Check required env vars
    if (!zitadelDomain) {
        result.errors.push('ZITADEL_DOMAIN not set in .env');
        result.passed = false;
    }

    if (!oauthClientId) {
        result.errors.push('ZITADEL_CLIENT_ID or VITE_ZITADEL_CLIENT_ID not set in .env');
        result.passed = false;
    }

    if (!clientJwtPath) {
        result.warnings.push('ZITADEL_CLIENT_JWT_PATH not set - introspection may not work');
    }

    if (!apiJwtPath) {
        result.warnings.push('ZITADEL_API_JWT_PATH not set - Management API may not work');
    }

    // Check Zitadel is reachable
    if (zitadelDomain) {
        try {
            const baseUrl = `http://${zitadelDomain}`;
            const response = await fetch(`${baseUrl}/debug/ready`, { 
                signal: AbortSignal.timeout(5000) 
            });
            
            if (!response.ok) {
                result.errors.push(`Zitadel not ready at ${baseUrl} (HTTP ${response.status})`);
                result.passed = false;
            }
        } catch (error) {
            result.errors.push(`Cannot reach Zitadel at http://${zitadelDomain}: ${error instanceof Error ? error.message : String(error)}`);
            result.passed = false;
        }
    }

    // Quick OAuth app existence check (if we have client ID and Zitadel is reachable)
    if (oauthClientId && zitadelDomain && result.passed) {
        try {
            const baseUrl = `http://${zitadelDomain}`;
            const testUrl = `${baseUrl}/oauth/v2/authorize?response_type=code&client_id=${oauthClientId}&redirect_uri=http://localhost:5176/auth/callback&scope=openid&code_challenge=test&code_challenge_method=S256`;
            
            const response = await fetch(testUrl, { 
                redirect: 'manual',
                signal: AbortSignal.timeout(5000)
            });

            // Should get 302 redirect or 200 (login page), not 400 (invalid_request)
            if (response.status === 400) {
                const body = await response.json();
                if (body.error === 'invalid_request' && body.error_description?.includes('NotFound')) {
                    result.errors.push(`OAuth client ID ${oauthClientId} not found in Zitadel. Run: ./scripts/bootstrap-zitadel-fully-automated.sh provision`);
                    result.passed = false;
                } else {
                    result.warnings.push(`OAuth endpoint returned error: ${body.error || 'unknown'}`);
                }
            }
        } catch (error) {
            result.warnings.push(`Could not verify OAuth app: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    return result;
}

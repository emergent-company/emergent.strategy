import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export interface PgConfig {
    host?: string; port?: number; user?: string; password?: string; database?: string;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
    private pool!: Pool;
    private online = false;
    private readonly logger = new Logger(DatabaseService.name);

    async onModuleInit() {
        try {
            this.pool = new Pool({
                host: process.env.PGHOST,
                port: Number(process.env.PGPORT || 5432),
                user: process.env.PGUSER,
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE,
            });
            // Try a simple query to confirm connectivity
            await this.pool.query('SELECT 1');
            this.online = true;
            if (process.env.DB_AUTOINIT === 'true') {
                await this.ensureSchema();
            }
        } catch (err) {
            this.online = false;
            this.logger.warn(`Database offline (non-fatal for tests): ${(err as Error).message}`);
        }
    }

    async onModuleDestroy() {
        if (this.pool) {
            try { await this.pool.end(); } catch { /* ignore */ }
        }
    }

    async query<T extends QueryResultRow = QueryResultRow>(text: string, params?: any[]): Promise<QueryResult<T>> {
        if (!this.online) {
            return { rows: [], rowCount: 0, command: 'SELECT', fields: [], oid: 0 } as unknown as QueryResult<T>;
        }
        return this.pool.query<T>(text, params);
    }

    async getClient(): Promise<PoolClient> { return this.pool.connect(); }

    isOnline() { return this.online; }

    private async ensureSchema() {
        // Minimal schema needed for documents listing. (Ingestion pipeline will manage full schema elsewhere.)
        await this.pool.query('CREATE SCHEMA IF NOT EXISTS kb');
        await this.pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
        await this.pool.query(`CREATE TABLE IF NOT EXISTS kb.documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_url TEXT,
        filename TEXT,
        mime_type TEXT,
        content TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );`);
    }
}

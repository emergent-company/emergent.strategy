-- PostgreSQL Initialization Script for Spec Server
-- ===================================================
-- Purpose: Create only PostgreSQL extensions
-- Schema creation is handled by application migrations (apps/server-nest/migrations/)
-- 
-- This keeps Docker init minimal and ensures schema consistency with migrations.
-- Run migrations after container starts: npm run db:migrate

-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Note: Schema (kb, core) and tables are created by migrations
-- See: apps/server-nest/migrations/0001_init.sql
-- Run: npm run db:migrate

-- Zitadel database and user creation is handled by 01-init-zitadel.sh
-- (allows using ZITADEL_DB_PASSWORD environment variable)
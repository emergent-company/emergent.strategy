-- Creates the memory database for the co-located Memory server.
-- Runs via docker-entrypoint-initdb.d on first container creation.
-- postgres entrypoint runs .sql files against the default DB ($POSTGRES_DB).
-- CREATE DATABASE cannot run inside a transaction, so we use a DO block
-- with dblink to execute it in a separate connection.

CREATE EXTENSION IF NOT EXISTS dblink;

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'memory') THEN
        PERFORM dblink_exec('dbname=postgres', 'CREATE DATABASE memory OWNER strategy');
    END IF;
END
$$;

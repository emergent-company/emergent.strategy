#!/bin/bash
set -e

# Create Zitadel user and database
# Uses environment variable ZITADEL_DB_PASSWORD or defaults to 'zitadel'
ZITADEL_PASSWORD="${ZITADEL_DB_PASSWORD:-zitadel}"

echo "Creating/updating Zitadel user and database..."

# First, create or update the user with password
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create Zitadel role if it doesn't exist, or update password if it does
    DO \$\$
    BEGIN 
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zitadel') THEN 
            CREATE ROLE zitadel LOGIN PASSWORD '$ZITADEL_PASSWORD';
            RAISE NOTICE 'Created zitadel user with password';
        ELSE
            -- User exists, update password
            ALTER ROLE zitadel WITH LOGIN PASSWORD '$ZITADEL_PASSWORD';
            RAISE NOTICE 'Updated zitadel user password';
        END IF;
    END;
    \$\$;
EOSQL

# Create database if it doesn't exist (must be done separately)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create database if it doesn't exist
    SELECT 'CREATE DATABASE zitadel OWNER zitadel'
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_database WHERE datname = 'zitadel'
    ) \gexec
EOSQL

# Grant necessary permissions
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Ensure zitadel user has necessary permissions
    GRANT CONNECT, CREATE, TEMP ON DATABASE zitadel TO zitadel;
EOSQL

echo "Zitadel user and database setup complete!"

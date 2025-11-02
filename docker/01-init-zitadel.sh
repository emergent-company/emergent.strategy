#!/bin/bash
set -e

# Create Zitadel user and database
# Uses environment variable ZITADEL_DB_PASSWORD or defaults to 'zitadel'
ZITADEL_PASSWORD="${ZITADEL_DB_PASSWORD:-zitadel}"

echo "Creating Zitadel user and database..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create Zitadel role if it doesn't exist
    DO \$\$
    BEGIN 
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'zitadel') THEN 
            CREATE ROLE zitadel LOGIN PASSWORD '$ZITADEL_PASSWORD';
        ELSE
            -- Update password if user already exists
            ALTER ROLE zitadel WITH PASSWORD '$ZITADEL_PASSWORD';
        END IF;
    END;
    \$\$;

    -- Create database if it doesn't exist
    SELECT 'CREATE DATABASE zitadel OWNER zitadel'
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_database WHERE datname = 'zitadel'
    );
EOSQL

# Execute the CREATE DATABASE command if it was selected
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -t -c "
    SELECT 'CREATE DATABASE zitadel OWNER zitadel'
    WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'zitadel')
" | grep -q "CREATE DATABASE" && psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE zitadel OWNER zitadel" || true

# Grant necessary permissions
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    GRANT CONNECT, CREATE, TEMP ON DATABASE zitadel TO zitadel;
EOSQL

echo "Zitadel user and database setup complete!"

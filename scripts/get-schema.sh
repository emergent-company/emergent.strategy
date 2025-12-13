#!/bin/bash
# Get database schema in compact format for AI agents
# Usage: ./scripts/get-schema.sh [tables|columns|full]
#
# This script outputs the current database schema directly from PostgreSQL,
# ensuring it's always up-to-date without manual maintenance.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Load environment
if [ -f "$REPO_ROOT/.env" ]; then
  set -a
  source "$REPO_ROOT/.env"
  set +a
fi
if [ -f "$REPO_ROOT/.env.local" ]; then
  set -a
  source "$REPO_ROOT/.env.local"
  set +a
fi

# Build connection string
POSTGRES_USER="${POSTGRES_USER:-emergent}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-emergent-dev-password}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-emergent}"
CONNECTION="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"

MODE="${1:-full}"

case "$MODE" in
  tables)
    # Just table names
    psql "$CONNECTION" -t -A -c "
      SELECT table_schema || '.' || table_name
      FROM information_schema.tables 
      WHERE table_schema IN ('kb', 'core') 
      AND table_type = 'BASE TABLE'
      ORDER BY table_schema, table_name;
    "
    ;;
  
  columns)
    # Tables with columns (compact)
    psql "$CONNECTION" -t -c "
      SELECT 
        c.table_schema || '.' || c.table_name as table_name,
        string_agg(c.column_name, ', ' ORDER BY c.ordinal_position) as columns
      FROM information_schema.columns c
      JOIN information_schema.tables t 
        ON c.table_schema = t.table_schema AND c.table_name = t.table_name
      WHERE c.table_schema IN ('kb', 'core') 
      AND t.table_type = 'BASE TABLE'
      GROUP BY c.table_schema, c.table_name
      ORDER BY c.table_schema, c.table_name;
    "
    ;;
  
  full|*)
    # Full schema info with types
    echo "# Database Schema"
    echo ""
    echo "## Schemas: kb (knowledge base), core (users), public (extensions)"
    echo ""
    echo "## Tables and Columns"
    echo ""
    psql "$CONNECTION" -t -c "
      SELECT 
        '### ' || c.table_schema || '.' || c.table_name || E'\n' ||
        string_agg(
          '- ' || c.column_name || ' (' || c.data_type || 
          CASE WHEN c.is_nullable = 'NO' THEN ', NOT NULL' ELSE '' END || ')',
          E'\n' ORDER BY c.ordinal_position
        ) || E'\n'
      FROM information_schema.columns c
      JOIN information_schema.tables t 
        ON c.table_schema = t.table_schema AND c.table_name = t.table_name
      WHERE c.table_schema IN ('kb', 'core') 
      AND t.table_type = 'BASE TABLE'
      GROUP BY c.table_schema, c.table_name
      ORDER BY c.table_schema, c.table_name;
    "
    ;;
esac

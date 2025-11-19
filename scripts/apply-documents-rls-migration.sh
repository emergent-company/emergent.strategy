#!/bin/bash
# Apply RLS migration for documents table
# Usage: ./apply-documents-rls-migration.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATION_FILE="$SCRIPT_DIR/../docs/migrations/011-enable-rls-on-documents-table.sql"

# Load environment
if [ -f "$SCRIPT_DIR/../.env" ]; then
  source "$SCRIPT_DIR/../.env"
else
  echo "Error: .env file not found"
  exit 1
fi

# Check if database URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL not set in .env"
  exit 1
fi

echo "==========================================="
echo "Documents Table RLS Migration"
echo "==========================================="
echo ""
echo "This migration will:"
echo "  1. Enable Row-Level Security on kb.documents"
echo "  2. Create 4 RLS policies (SELECT, INSERT, UPDATE, DELETE)"
echo "  3. Enforce project-based isolation at database level"
echo ""
echo "Database: $DATABASE_URL"
echo ""

# Extract database connection details for docker exec
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*\/\/\([^:]*\):.*/\1/p')

echo "Connection details:"
echo "  Host: $DB_HOST"
echo "  Port: $DB_PORT"
echo "  Database: $DB_NAME"
echo "  User: $DB_USER"
echo ""

read -p "Continue with migration? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Migration cancelled"
  exit 0
fi

echo ""
echo "Step 1: Checking current RLS status..."
docker exec spec-server-2-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -c \
  "SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname='kb' AND tablename='documents';"

echo ""
echo "Step 2: Checking existing policies..."
docker exec spec-server-2-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -c \
  "SELECT schemaname, tablename, policyname, cmd FROM pg_policies WHERE schemaname='kb' AND tablename='documents';"

echo ""
echo "Step 3: Applying migration..."
docker exec -i spec-server-2-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" < "$MIGRATION_FILE"

echo ""
echo "Step 4: Verifying RLS is enabled..."
docker exec spec-server-2-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -c \
  "SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname='kb' AND tablename='documents';"

echo ""
echo "Step 5: Verifying policies were created..."
docker exec spec-server-2-postgres-1 psql -U "$DB_USER" -d "$DB_NAME" -c \
  "SELECT schemaname, tablename, policyname, cmd FROM pg_policies WHERE schemaname='kb' AND tablename='documents' ORDER BY policyname;"

echo ""
echo "==========================================="
echo "Migration complete!"
echo "==========================================="
echo ""
echo "Next steps:"
echo "  1. Test document list endpoint with different project contexts"
echo "  2. Verify cross-project isolation"
echo "  3. Check application logs for any RLS-related errors"
echo "  4. Run: npm run test (to verify nothing broke)"
echo ""

#!/bin/bash
# Migration Helper Script
# Provides shortcuts for common migration tasks

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load environment
if [ -f .env ]; then
  set -a
  source .env 2>/dev/null || true
  set +a
fi

function print_header() {
  echo ""
  echo -e "${BLUE}╔══════════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║${NC}  $1"
  echo -e "${BLUE}╚══════════════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

function print_success() {
  echo -e "${GREEN}✅ $1${NC}"
}

function print_error() {
  echo -e "${RED}❌ $1${NC}"
}

function print_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

function print_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

function show_help() {
  cat << HELP
Migration Helper Script

Usage: ./scripts/migration-helper.sh <command>

Commands:
  help              Show this help message
  status            Check migration status
  verify-phase1     Verify Phase 1 completion
  dry-run           Run migration in dry-run mode
  migrate           Execute full migration
  migrate-type      Migrate specific object type
  verify-phase2     Verify Phase 2 completion
  rollback          Rollback migration (delete migrated relationships)
  test-queries      Run test queries
  stats             Show migration statistics

Examples:
  ./scripts/migration-helper.sh status
  ./scripts/migration-helper.sh dry-run
  ./scripts/migration-helper.sh migrate-type Event
  ./scripts/migration-helper.sh rollback

HELP
}

function check_database() {
  if ! psql "$DATABASE_URL" -c "SELECT 1" &>/dev/null; then
    print_error "Database not accessible"
    print_info "Start database with: docker compose -f docker/docker-compose.yml up -d db"
    exit 1
  fi
}

function show_status() {
  print_header "Migration Status"
  
  check_database
  
  # Check Phase 1
  echo "Phase 1: Schema Updates"
  RELATIONSHIP_COUNT=$(psql "$DATABASE_URL" -t -c "
    SELECT COUNT(*)
    FROM kb.template_packs tp,
    LATERAL jsonb_each(tp.config->'relationship_type_schemas')
    WHERE tp.name = 'Bible Knowledge Graph';
  " | xargs)
  
  if [ "$RELATIONSHIP_COUNT" -eq "23" ]; then
    print_success "23 relationship types found"
  else
    print_warning "Expected 23, found $RELATIONSHIP_COUNT"
  fi
  
  # Check Phase 2
  echo ""
  echo "Phase 2: Data Migration"
  
  EMBEDDED_COUNT=$(psql "$DATABASE_URL" -t -c "
    SELECT 
      COUNT(*) FILTER (WHERE properties->>'parties' IS NOT NULL) +
      COUNT(*) FILTER (WHERE properties->>'participants' IS NOT NULL) +
      COUNT(*) FILTER (WHERE properties->>'witnesses' IS NOT NULL) +
      COUNT(*) FILTER (WHERE properties->>'performer' IS NOT NULL)
    FROM kb.graph_objects;
  " | xargs)
  
  MIGRATED_COUNT=$(psql "$DATABASE_URL" -t -c "
    SELECT COUNT(*) FROM kb.graph_relationships
    WHERE properties->>'_migrated_from' IS NOT NULL;
  " | xargs)
  
  echo "Embedded relationships: $EMBEDDED_COUNT objects"
  echo "Migrated relationships: $MIGRATED_COUNT records"
  
  if [ "$MIGRATED_COUNT" -eq "0" ]; then
    print_warning "Phase 2 not started"
  elif [ "$EMBEDDED_COUNT" -gt "0" ] && [ "$MIGRATED_COUNT" -gt "0" ]; then
    print_success "Phase 2 in progress or complete"
  fi
  
  echo ""
}

function verify_phase1() {
  print_header "Verifying Phase 1"
  
  if [ -f "./scripts/verify-phase1-complete.sh" ]; then
    ./scripts/verify-phase1-complete.sh
  else
    print_error "Verification script not found"
    exit 1
  fi
}

function dry_run() {
  print_header "Migration Dry Run"
  
  check_database
  
  print_info "Running migration in dry-run mode (no changes will be made)..."
  echo ""
  
  npm run migrate:embedded-relationships:dry-run
}

function migrate() {
  print_header "Execute Migration"
  
  check_database
  
  print_warning "This will create explicit relationships in the database"
  echo ""
  read -p "Continue? (y/N) " -n 1 -r
  echo ""
  
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Running migration..."
    npm run migrate:embedded-relationships
  else
    print_info "Migration cancelled"
  fi
}

function migrate_type() {
  TYPE=$1
  
  if [ -z "$TYPE" ]; then
    print_error "Object type required"
    echo "Usage: $0 migrate-type <Event|Covenant|Miracle>"
    exit 1
  fi
  
  print_header "Migrate Type: $TYPE"
  
  check_database
  
  print_info "Migrating only $TYPE objects..."
  echo ""
  
  npm run migrate:embedded-relationships -- --type="$TYPE"
}

function verify_phase2() {
  print_header "Verifying Phase 2"
  
  check_database
  
  print_info "Running dry run to check if migration is complete..."
  echo ""
  
  npm run migrate:embedded-relationships:dry-run
  
  echo ""
  print_info "Checking relationship counts..."
  
  psql "$DATABASE_URL" -c "
    SELECT 
      relationship_type,
      properties->>'_migrated_from' as migrated_from,
      COUNT(*) as count
    FROM kb.graph_relationships
    WHERE properties->>'_migrated_from' IS NOT NULL
    GROUP BY relationship_type, properties->>'_migrated_from'
    ORDER BY relationship_type;
  "
}

function rollback() {
  print_header "Rollback Migration"
  
  check_database
  
  MIGRATED_COUNT=$(psql "$DATABASE_URL" -t -c "
    SELECT COUNT(*) FROM kb.graph_relationships
    WHERE properties->>'_migrated_from' IS NOT NULL;
  " | xargs)
  
  if [ "$MIGRATED_COUNT" -eq "0" ]; then
    print_info "No migrated relationships to rollback"
    exit 0
  fi
  
  print_warning "This will delete $MIGRATED_COUNT migrated relationships"
  print_info "Embedded properties will remain intact"
  echo ""
  read -p "Continue? (y/N) " -n 1 -r
  echo ""
  
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_info "Rolling back migration..."
    
    psql "$DATABASE_URL" -c "
      DELETE FROM kb.graph_relationships
      WHERE properties->>'_migrated_from' IS NOT NULL;
    "
    
    print_success "Rollback complete"
  else
    print_info "Rollback cancelled"
  fi
}

function test_queries() {
  print_header "Running Test Queries"
  
  check_database
  
  if [ ! -f "./scripts/test-migration-queries.sql" ]; then
    print_error "Test queries file not found"
    exit 1
  fi
  
  print_info "Running verification queries..."
  echo ""
  
  psql "$DATABASE_URL" -f ./scripts/test-migration-queries.sql
}

function show_stats() {
  print_header "Migration Statistics"
  
  check_database
  
  echo "Embedded Relationships:"
  psql "$DATABASE_URL" -c "
    SELECT 
      COUNT(*) FILTER (WHERE properties->>'parties' IS NOT NULL) as parties,
      COUNT(*) FILTER (WHERE properties->>'participants' IS NOT NULL) as participants,
      COUNT(*) FILTER (WHERE properties->>'witnesses' IS NOT NULL) as witnesses,
      COUNT(*) FILTER (WHERE properties->>'performer' IS NOT NULL) as performer,
      COUNT(*) as total_objects
    FROM kb.graph_objects;
  "
  
  echo ""
  echo "Explicit Relationships:"
  psql "$DATABASE_URL" -c "
    SELECT 
      COUNT(*) FILTER (WHERE properties->>'_migrated_from' IS NOT NULL) as migrated,
      COUNT(*) FILTER (WHERE properties->>'_migrated_from' IS NULL) as manual,
      COUNT(*) as total
    FROM kb.graph_relationships;
  "
  
  echo ""
  echo "Breakdown by Type:"
  psql "$DATABASE_URL" -c "
    SELECT 
      relationship_type,
      COUNT(*) as count
    FROM kb.graph_relationships
    WHERE properties->>'_migrated_from' IS NOT NULL
    GROUP BY relationship_type
    ORDER BY count DESC;
  "
}

# Main command handler
COMMAND=$1
shift || true

case "$COMMAND" in
  help|--help|-h)
    show_help
    ;;
  status)
    show_status
    ;;
  verify-phase1)
    verify_phase1
    ;;
  dry-run)
    dry_run
    ;;
  migrate)
    migrate
    ;;
  migrate-type)
    migrate_type "$@"
    ;;
  verify-phase2)
    verify_phase2
    ;;
  rollback)
    rollback
    ;;
  test-queries)
    test_queries
    ;;
  stats)
    show_stats
    ;;
  *)
    echo "Unknown command: $COMMAND"
    echo ""
    show_help
    exit 1
    ;;
esac

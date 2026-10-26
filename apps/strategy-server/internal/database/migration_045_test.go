package database_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

func TestMigration045_ProjectionSchema(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()

	for _, col := range []string{"memory_generation", "memory_dirty_since", "memory_change_seq"} {
		var n int
		err := db.NewRaw(
			`SELECT count(*) FROM information_schema.columns
			 WHERE table_name = 'strategy_instances' AND column_name = ?`, col,
		).Scan(ctx, &n)
		if err != nil || n != 1 {
			t.Errorf("column strategy_instances.%s: count=%d err=%v", col, n, err)
		}
	}

	var n int
	if err := db.NewRaw(
		`SELECT count(*) FROM information_schema.tables WHERE table_name = 'memory_projection'`,
	).Scan(ctx, &n); err != nil || n != 1 {
		t.Fatalf("table memory_projection: count=%d err=%v", n, err)
	}
}

func TestMigration045_ProjectionKindCheck(t *testing.T) {
	db := database.TestDB(t)
	_, _, instID := seedTokenFixtures(t, db)
	ctx := context.Background()

	if _, err := db.ExecContext(ctx,
		`INSERT INTO memory_projection (instance_id, kind, key) VALUES (?, 'object', 'k')`, instID,
	); err != nil {
		t.Fatalf("insert valid kind: %v", err)
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO memory_projection (instance_id, kind, key) VALUES (?, 'bogus', 'k')`, instID,
	); err == nil {
		t.Fatal("expected CHECK violation for kind='bogus'")
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO memory_projection (instance_id, kind, key) VALUES (?, 'object', 'k')`, instID,
	); err == nil {
		t.Fatal("expected primary key violation for duplicate (instance_id, kind, key)")
	}
}

func TestMigration045_ProjectionCascadesWithInstance(t *testing.T) {
	db := database.TestDB(t)
	_, _, instID := seedTokenFixtures(t, db)
	ctx := context.Background()

	if _, err := db.ExecContext(ctx,
		`INSERT INTO memory_projection (instance_id, kind, key) VALUES (?, 'object', 'k')`, instID,
	); err != nil {
		t.Fatalf("insert: %v", err)
	}
	if _, err := db.ExecContext(ctx, `DELETE FROM strategy_instances WHERE id = ?`, instID); err != nil {
		t.Fatalf("hard delete instance: %v", err)
	}
	var n int
	if err := db.NewRaw(`SELECT count(*) FROM memory_projection WHERE instance_id = ?`, instID).Scan(ctx, &n); err != nil || n != 0 {
		t.Fatalf("projection rows after instance delete: n=%d err=%v", n, err)
	}
}

// Two instances whose UUIDs share their first 8 hex characters would write to
// the same scoped Memory keys, so the database must refuse the second one.
func TestMigration045_KeyPrefixIsUnique(t *testing.T) {
	db := database.TestDB(t)
	_, _, instID := seedTokenFixtures(t, db)
	ctx := context.Background()

	var wsID uuid.UUID
	if err := db.NewRaw(`SELECT workspace_id FROM strategy_instances WHERE id = ?`, instID).Scan(ctx, &wsID); err != nil {
		t.Fatalf("load workspace: %v", err)
	}

	clash := uuid.MustParse(instID.String()[:8] + "-0000-4000-8000-000000000000")
	_, err := db.ExecContext(ctx,
		`INSERT INTO strategy_instances (id, workspace_id, name) VALUES (?, ?, 'clash')`, clash, wsID)
	if err == nil {
		t.Fatal("expected unique violation for a colliding 8-character prefix")
	}
	if !database.IsKeyPrefixCollision(err) {
		t.Fatalf("error not recognised as a prefix collision: %v", err)
	}

	other := uuid.New()
	if other.String()[:8] == instID.String()[:8] {
		t.Skip("random UUID collided with fixture")
	}
	if _, err := db.ExecContext(ctx,
		`INSERT INTO strategy_instances (id, workspace_id, name) VALUES (?, ?, 'ok')`, other, wsID,
	); err != nil {
		t.Fatalf("non-colliding instance rejected: %v", err)
	}
}

// Soft-deleted instances keep their prefix reserved: a purge can lag behind
// the soft delete, and the old objects still carry the prefix.
func TestMigration045_DeletedInstanceKeepsPrefixReserved(t *testing.T) {
	db := database.TestDB(t)
	_, _, instID := seedTokenFixtures(t, db)
	ctx := context.Background()

	if _, err := db.ExecContext(ctx, `UPDATE strategy_instances SET deleted_at = now() WHERE id = ?`, instID); err != nil {
		t.Fatalf("soft delete: %v", err)
	}
	var wsID uuid.UUID
	if err := db.NewRaw(`SELECT workspace_id FROM strategy_instances WHERE id = ?`, instID).Scan(ctx, &wsID); err != nil {
		t.Fatalf("load workspace: %v", err)
	}
	clash := uuid.MustParse(instID.String()[:8] + "-1111-4000-8000-000000000000")
	if _, err := db.ExecContext(ctx,
		`INSERT INTO strategy_instances (id, workspace_id, name) VALUES (?, ?, 'clash')`, clash, wsID,
	); err == nil {
		t.Fatal("prefix of a soft-deleted instance must stay reserved")
	}
}

// After the upgrade every active instance must be re-ingested, which the
// startup sweep does for instances whose content hash is NULL. The test re-runs
// the migration's own UPDATE against populated rows.
func TestMigration045_ForcesReingestOfActiveInstances(t *testing.T) {
	db := database.TestDB(t)
	_, _, instID := seedTokenFixtures(t, db)
	ctx := context.Background()

	if _, err := db.ExecContext(ctx,
		`UPDATE strategy_instances SET memory_content_hash = 'abc' WHERE id = ?`, instID); err != nil {
		t.Fatalf("set hash: %v", err)
	}
	if _, err := db.ExecContext(ctx, migrationStatement(t, "045_memory_projection.sql", "UPDATE strategy_instances")); err != nil {
		t.Fatalf("run migration statement: %v", err)
	}
	var hash *string
	if err := db.NewRaw(`SELECT memory_content_hash FROM strategy_instances WHERE id = ?`, instID).Scan(ctx, &hash); err != nil {
		t.Fatalf("read hash: %v", err)
	}
	if hash != nil {
		t.Fatalf("memory_content_hash = %q, want NULL", *hash)
	}
}

// migrationStatement returns the first statement in the named migration's Up
// section that starts with prefix, so tests run the migration's own SQL.
func migrationStatement(t *testing.T, file, prefix string) string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("migrations", file))
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	up, _, _ := strings.Cut(string(raw), "-- +goose Down")
	for _, stmt := range strings.Split(up, ";") {
		stmt = strings.TrimSpace(stmt)
		if i := strings.Index(stmt, prefix); i >= 0 {
			return stmt[i:]
		}
	}
	t.Fatalf("no statement starting with %q in %s", prefix, file)
	return ""
}

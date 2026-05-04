package database

import (
	"database/sql"
	"fmt"
	"math/rand"
	"os"
	"testing"

	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
	"github.com/uptrace/bun/driver/pgdriver"
)

// testMaintenanceDSN returns the DSN for the maintenance postgres database used
// in tests. Override with TEST_DATABASE_URL env var.
func testMaintenanceDSN() string {
	if dsn := os.Getenv("TEST_DATABASE_URL"); dsn != "" {
		return dsn
	}
	return "postgres://strategy:strategy@localhost:5433/postgres?sslmode=disable"
}

// TestDB creates an isolated PostgreSQL database for a test, runs all migrations,
// and registers a cleanup function to drop the database after the test completes.
//
// Usage:
//
//	func TestMyFeature(t *testing.T) {
//	    db := database.TestDB(t)
//	    svc := mypackage.NewService(db)
//	    ...
//	}
//
// Requires a running PostgreSQL instance. Start with: task docker-deps
// Default connects to postgres://strategy:strategy@localhost:5433/postgres
// Override with TEST_DATABASE_URL env var.
func TestDB(t *testing.T) *bun.DB {
	t.Helper()

	// Use a unique database name per test to achieve isolation.
	// The random suffix ensures -count=N reruns don't share the same DB.
	dbName := fmt.Sprintf("strategy_test_%s_%06d", sanitizeTestName(t.Name()), rand.Intn(1_000_000)) //nolint:gosec

	// Connect to the maintenance "postgres" database to create/drop test databases.
	maintenanceDSN := testMaintenanceDSN()
	maintenanceSQL := sql.OpenDB(pgdriver.NewConnector(pgdriver.WithDSN(maintenanceDSN)))
	t.Cleanup(func() { _ = maintenanceSQL.Close() })

	// Drop any leftover database from a previous run, then create a fresh one.
	_, err := maintenanceSQL.Exec(fmt.Sprintf(`DROP DATABASE IF EXISTS %q WITH (FORCE)`, dbName))
	if err != nil {
		t.Fatalf("testdb: drop old database %q: %v", dbName, err)
	}
	_, err = maintenanceSQL.Exec(fmt.Sprintf(`CREATE DATABASE %q OWNER strategy`, dbName))
	if err != nil {
		t.Fatalf("testdb: create database %q: %v", dbName, err)
	}

	t.Cleanup(func() {
		_, _ = maintenanceSQL.Exec(fmt.Sprintf(`DROP DATABASE IF EXISTS %q WITH (FORCE)`, dbName))
	})

	// Open the test database (same host/port as maintenance DSN, different db name).
	testDSN := fmt.Sprintf("postgres://strategy:strategy@localhost:5433/%s?sslmode=disable", dbName)
	testSQL := sql.OpenDB(pgdriver.NewConnector(pgdriver.WithDSN(testDSN)))
	db := bun.NewDB(testSQL, pgdialect.New())
	t.Cleanup(func() { _ = db.Close() })

	registerModels(db)

	// Run migrations.
	if err := Migrate(db); err != nil {
		t.Fatalf("testdb: migrate %q: %v", dbName, err)
	}

	return db
}

// sanitizeTestName converts a test name to a valid PostgreSQL identifier segment.
func sanitizeTestName(name string) string {
	var out []byte
	for _, c := range []byte(name) {
		switch {
		case c >= 'a' && c <= 'z', c >= '0' && c <= '9':
			out = append(out, c)
		case c >= 'A' && c <= 'Z':
			out = append(out, c+32) // lowercase
		default:
			out = append(out, '_')
		}
	}
	// Truncate to stay within 63-char PostgreSQL identifier limit (leaving room for prefix).
	if len(out) > 40 {
		out = out[:40]
	}
	return string(out)
}

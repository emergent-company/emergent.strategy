// Package database provides database connection, migration, and test helpers.
package database

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"log/slog"

	"github.com/pressly/goose/v3"
	"github.com/uptrace/bun"
	"github.com/uptrace/bun/dialect/pgdialect"
	"github.com/uptrace/bun/driver/pgdriver"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/config"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

// DB is the application database handle. It wraps bun.DB.
type DB = bun.DB

// Open opens a PostgreSQL connection pool and verifies connectivity.
// The caller is responsible for calling Close().
func Open(cfg *config.Config) (*bun.DB, error) {
	dsn := cfg.PostgresDSN()

	// Redact password for logging
	slog.Info("connecting to postgres", "host", cfg.PGHost, "port", cfg.PGPort, "database", cfg.PGDBName)

	sqldb := sql.OpenDB(pgdriver.NewConnector(pgdriver.WithDSN(dsn)))
	sqldb.SetMaxOpenConns(25)
	sqldb.SetMaxIdleConns(5)

	db := bun.NewDB(sqldb, pgdialect.New())

	// Register models
	registerModels(db)

	// Verify connection
	if err := db.PingContext(context.Background()); err != nil {
		return nil, fmt.Errorf("ping postgres: %w", err)
	}

	return db, nil
}

// Migrate runs all pending goose migrations using an advisory lock to prevent
// concurrent migration runs when multiple replicas start simultaneously.
func Migrate(db *bun.DB) error {
	sqldb := db.DB

	// Acquire an advisory lock so only one instance runs migrations at a time.
	if _, err := sqldb.Exec("SELECT pg_advisory_lock(1234567890)"); err != nil {
		return fmt.Errorf("acquire advisory lock: %w", err)
	}
	defer func() {
		_, _ = sqldb.Exec("SELECT pg_advisory_unlock(1234567890)")
	}()

	goose.SetBaseFS(migrationFS)
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("set goose dialect: %w", err)
	}

	if err := goose.Up(sqldb, "migrations"); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}

	return nil
}

// Reset drops and recreates the database. Only call in development.
// cfg is used to connect to the "postgres" maintenance database.
func Reset(db *bun.DB, cfg *config.Config) error {
	dbName := cfg.PGDBName

	// Connect to the postgres maintenance database
	maintenanceDSN := fmt.Sprintf("postgres://%s:%s@%s:%d/postgres?sslmode=%s",
		cfg.PGUser, cfg.PGPass, cfg.PGHost, cfg.PGPort, cfg.PGSSLMode)
	maintenanceDB := sql.OpenDB(pgdriver.NewConnector(pgdriver.WithDSN(maintenanceDSN)))
	defer func() { _ = maintenanceDB.Close() }()

	if _, err := maintenanceDB.Exec(fmt.Sprintf("DROP DATABASE IF EXISTS %q WITH (FORCE)", dbName)); err != nil {
		return fmt.Errorf("drop database: %w", err)
	}
	if _, err := maintenanceDB.Exec(fmt.Sprintf("CREATE DATABASE %q OWNER %q", dbName, cfg.PGUser)); err != nil {
		return fmt.Errorf("create database: %w", err)
	}

	slog.Info("database recreated", "database", dbName)

	return Migrate(db)
}

// registerModels registers all bun model types with the DB.
func registerModels(db *bun.DB) {
	db.RegisterModel(
		(*domain.Workspace)(nil),
		(*domain.StrategyInstance)(nil),
		(*domain.StrategyMutation)(nil),
		(*domain.AuditLog)(nil),
	)
}

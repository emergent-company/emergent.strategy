// Package main provides a CLI for database migrations.
package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"os"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/emergent/emergent-core/migrations"
)

func main() {
	var (
		command     string
		version     int64
		showHelp    bool
		showVersion bool
	)

	flag.StringVar(&command, "c", "status", "Command: up, up-to, down, status, version, create")
	flag.Int64Var(&version, "v", 0, "Target version for up-to command")
	flag.BoolVar(&showHelp, "h", false, "Show help")
	flag.BoolVar(&showVersion, "version", false, "Show goose version")
	flag.Parse()

	if showHelp {
		printUsage()
		os.Exit(0)
	}

	if showVersion {
		fmt.Println("Goose migration tool v3.26.0")
		os.Exit(0)
	}

	// Get database URL from environment
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		// Build from individual components
		host := getEnvDefault("DB_HOST", "localhost")
		port := getEnvDefault("DB_PORT", "5432")
		user := getEnvDefault("POSTGRES_USER", "emergent")
		pass := os.Getenv("POSTGRES_PASSWORD")
		name := getEnvDefault("POSTGRES_DATABASE", "emergent")
		sslMode := getEnvDefault("DB_SSL_MODE", "disable")

		if pass == "" {
			fmt.Fprintln(os.Stderr, "Error: POSTGRES_PASSWORD or DATABASE_URL must be set")
			os.Exit(1)
		}

		dbURL = fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
			user, pass, host, port, name, sslMode)
	}

	// Connect to database
	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error connecting to database: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		fmt.Fprintf(os.Stderr, "Error pinging database: %v\n", err)
		os.Exit(1)
	}

	// Setup goose
	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		fmt.Fprintf(os.Stderr, "Error setting dialect: %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()

	// Run command
	switch command {
	case "up":
		if err := goose.UpContext(ctx, db, "."); err != nil {
			fmt.Fprintf(os.Stderr, "Error running migrations: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Migrations completed successfully")

	case "up-to":
		if version == 0 {
			fmt.Fprintln(os.Stderr, "Error: -v flag required for up-to command")
			os.Exit(1)
		}
		if err := goose.UpToContext(ctx, db, ".", version); err != nil {
			fmt.Fprintf(os.Stderr, "Error running migrations: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Migrated to version %d\n", version)

	case "down":
		if err := goose.DownContext(ctx, db, "."); err != nil {
			fmt.Fprintf(os.Stderr, "Error rolling back: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Rollback completed successfully")

	case "status":
		if err := goose.StatusContext(ctx, db, "."); err != nil {
			fmt.Fprintf(os.Stderr, "Error getting status: %v\n", err)
			os.Exit(1)
		}

	case "version":
		ver, err := goose.GetDBVersionContext(ctx, db)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error getting version: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Current version: %d\n", ver)

	case "create":
		args := flag.Args()
		if len(args) < 1 {
			fmt.Fprintln(os.Stderr, "Error: migration name required")
			fmt.Fprintln(os.Stderr, "Usage: migrate -c create <name>")
			os.Exit(1)
		}
		name := args[0]
		if err := goose.Create(db, "migrations", name, "sql"); err != nil {
			fmt.Fprintf(os.Stderr, "Error creating migration: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Created new migration: %s\n", name)

	case "mark-applied":
		if version == 0 {
			fmt.Fprintln(os.Stderr, "Error: -v flag required for mark-applied command")
			os.Exit(1)
		}
		// Ensure goose_db_version table exists
		if _, err := goose.EnsureDBVersionContext(ctx, db); err != nil {
			fmt.Fprintf(os.Stderr, "Error ensuring version table: %v\n", err)
			os.Exit(1)
		}
		// Check if already applied
		var count int
		err := db.QueryRowContext(ctx, `SELECT COUNT(*) FROM goose_db_version WHERE version_id = $1`, version).Scan(&count)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error checking migration status: %v\n", err)
			os.Exit(1)
		}
		if count > 0 {
			fmt.Printf("Migration %d is already recorded\n", version)
			os.Exit(0)
		}
		// Mark as applied
		_, err = db.ExecContext(ctx, `
			INSERT INTO goose_db_version (version_id, is_applied, tstamp)
			VALUES ($1, true, now())
		`, version)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error marking migration as applied: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Marked migration %d as applied\n", version)

	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n", command)
		printUsage()
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println(`Database Migration Tool

Commands:
  -c up           Run all pending migrations
  -c up-to -v N   Run migrations up to version N
  -c down         Rollback the last migration
  -c status       Show migration status
  -c version      Show current database version
  -c create NAME  Create a new migration file
  -c mark-applied -v N  Mark migration N as applied without running it

Environment Variables:
  DATABASE_URL         Full PostgreSQL connection string
  -- or --
  DB_HOST              Database host (default: localhost)
  DB_PORT              Database port (default: 5432)
  POSTGRES_USER        Database user (default: emergent)
  POSTGRES_PASSWORD    Database password (required)
  POSTGRES_DATABASE    Database name (default: emergent)
  DB_SSL_MODE          SSL mode (default: disable)

Examples:
  # Run all migrations
  ./migrate -c up

  # Check migration status
  ./migrate -c status

  # Create a new migration
  ./migrate -c create add_new_table

  # Mark baseline as applied (for existing databases)
  ./migrate -c mark-applied -v 1`)
}

func getEnvDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

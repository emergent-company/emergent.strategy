// Package main provides a CLI for common development tasks.
// This is the Go equivalent of npm scripts for server-go.
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

const (
	defaultServerURL = "http://localhost:3002"
	defaultTimeout   = 10 * time.Second
)

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	command := os.Args[1]

	switch command {
	case "health", "healthcheck", "hc":
		runHealthCheck()
	case "test":
		runTests(os.Args[2:])
	case "test:e2e", "test-e2e":
		runE2ETests(os.Args[2:])
	case "test:unit", "test-unit":
		runUnitTests(os.Args[2:])
	case "build":
		runBuild()
	case "lint":
		runLint()
	case "fmt":
		runFmt()
	case "db:status", "db-status":
		runDBStatus()
	case "help", "-h", "--help":
		printUsage()
	default:
		fmt.Fprintf(os.Stderr, "Unknown command: %s\n\n", command)
		printUsage()
		os.Exit(1)
	}
}

// ============================================================================
// Health Check Command
// ============================================================================

func runHealthCheck() {
	fs := flag.NewFlagSet("health", flag.ExitOnError)
	serverURL := fs.String("url", defaultServerURL, "Server URL to check")
	verbose := fs.Bool("v", false, "Verbose output")
	checkDB := fs.Bool("db", false, "Also check database connectivity")
	_ = fs.Parse(os.Args[2:])

	fmt.Println("Health Check")
	fmt.Println("============")

	allHealthy := true

	// Check HTTP health endpoint
	httpHealthy := checkHTTPHealth(*serverURL, *verbose)
	if !httpHealthy {
		allHealthy = false
	}

	// Optionally check database
	if *checkDB {
		dbHealthy := checkDBHealth(*verbose)
		if !dbHealthy {
			allHealthy = false
		}
	}

	fmt.Println()
	if allHealthy {
		fmt.Println("Status: HEALTHY")
		os.Exit(0)
	} else {
		fmt.Println("Status: UNHEALTHY")
		os.Exit(1)
	}
}

func checkHTTPHealth(serverURL string, verbose bool) bool {
	fmt.Printf("\nServer (%s):\n", serverURL)

	endpoints := []struct {
		path string
		name string
	}{
		{"/health", "Health"},
		{"/ready", "Ready"},
	}

	allOK := true
	client := &http.Client{Timeout: defaultTimeout}

	for _, ep := range endpoints {
		url := serverURL + ep.path
		start := time.Now()
		resp, err := client.Get(url)
		latency := time.Since(start)

		if err != nil {
			fmt.Printf("  %s: FAIL (%v)\n", ep.name, err)
			allOK = false
			continue
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusOK {
			fmt.Printf("  %s: OK (%dms)\n", ep.name, latency.Milliseconds())
			if verbose {
				var body map[string]any
				if err := json.NewDecoder(resp.Body).Decode(&body); err == nil {
					prettyJSON, _ := json.MarshalIndent(body, "    ", "  ")
					fmt.Printf("    %s\n", prettyJSON)
				}
			}
		} else {
			fmt.Printf("  %s: FAIL (status %d)\n", ep.name, resp.StatusCode)
			allOK = false
		}
	}

	return allOK
}

func checkDBHealth(verbose bool) bool {
	fmt.Println("\nDatabase:")

	dbURL := buildDBURL()
	if dbURL == "" {
		fmt.Println("  Connection: SKIP (no credentials configured)")
		return true
	}

	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		fmt.Printf("  Connection: FAIL (%v)\n", err)
		return false
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
	defer cancel()

	start := time.Now()
	if err := db.PingContext(ctx); err != nil {
		fmt.Printf("  Connection: FAIL (%v)\n", err)
		return false
	}
	latency := time.Since(start)
	fmt.Printf("  Connection: OK (%dms)\n", latency.Milliseconds())

	if verbose {
		var version string
		if err := db.QueryRowContext(ctx, "SELECT version()").Scan(&version); err == nil {
			// Truncate long version string
			if len(version) > 60 {
				version = version[:60] + "..."
			}
			fmt.Printf("    Version: %s\n", version)
		}
	}

	return true
}

// ============================================================================
// Test Commands
// ============================================================================

func runTests(args []string) {
	fs := flag.NewFlagSet("test", flag.ExitOnError)
	verbose := fs.Bool("v", false, "Verbose output")
	run := fs.String("run", "", "Run only tests matching pattern")
	count := fs.Int("count", 1, "Run tests N times")
	_ = fs.Parse(args)

	cmdArgs := []string{"test", "./..."}

	if *verbose {
		cmdArgs = append(cmdArgs, "-v")
	}
	if *run != "" {
		cmdArgs = append(cmdArgs, "-run", *run)
	}
	cmdArgs = append(cmdArgs, fmt.Sprintf("-count=%d", *count))

	runGoCommand(cmdArgs)
}

func runE2ETests(args []string) {
	fs := flag.NewFlagSet("test:e2e", flag.ExitOnError)
	verbose := fs.Bool("v", true, "Verbose output")
	run := fs.String("run", "", "Run only tests matching pattern (e.g., TestDocumentsSuite)")
	external := fs.Bool("external", true, "Test against external server (TEST_SERVER_URL)")
	serverURL := fs.String("url", defaultServerURL, "External server URL")
	count := fs.Int("count", 1, "Run tests N times")
	_ = fs.Parse(args)

	cmdArgs := []string{"test", "./tests/e2e/..."}

	if *verbose {
		cmdArgs = append(cmdArgs, "-v")
	}
	if *run != "" {
		cmdArgs = append(cmdArgs, "-run", *run)
	}
	cmdArgs = append(cmdArgs, fmt.Sprintf("-count=%d", *count))

	// Set environment for external server testing
	env := os.Environ()
	if *external {
		env = append(env, "TEST_SERVER_URL="+*serverURL)
		fmt.Printf("Running E2E tests against: %s\n\n", *serverURL)
	} else {
		fmt.Println("Running E2E tests with in-process server")
		fmt.Println("Note: Requires database access")
	}

	runGoCommandWithEnv(cmdArgs, env)
}

func runUnitTests(args []string) {
	fs := flag.NewFlagSet("test:unit", flag.ExitOnError)
	verbose := fs.Bool("v", false, "Verbose output")
	run := fs.String("run", "", "Run only tests matching pattern")
	_ = fs.Parse(args)

	// Unit tests are everything except e2e
	cmdArgs := []string{"test"}

	// Get all packages except tests/e2e
	packages := []string{
		"./domain/...",
		"./internal/...",
		"./pkg/...",
	}
	cmdArgs = append(cmdArgs, packages...)

	if *verbose {
		cmdArgs = append(cmdArgs, "-v")
	}
	if *run != "" {
		cmdArgs = append(cmdArgs, "-run", *run)
	}
	cmdArgs = append(cmdArgs, "-count=1")

	runGoCommand(cmdArgs)
}

// ============================================================================
// Build Commands
// ============================================================================

func runBuild() {
	fmt.Println("Building server-go (step-by-step)...")

	packages := []struct {
		name string
		path string
	}{
		{"pkg", "./pkg/..."},
		{"internal", "./internal/..."},
		{"domain", "./domain/..."},
		{"cmd/tasks", "./cmd/tasks"},
		{"cmd/migrate", "./cmd/migrate"},
		{"cmd/server", "./cmd/server"},
		{"tests", "./tests/..."},
	}

	for _, pkg := range packages {
		fmt.Printf("  Building %s... ", pkg.name)
		cmd := exec.Command("go", "build", pkg.path)
		cmd.Dir = getServerGoDir()
		output, err := cmd.CombinedOutput()
		if err != nil {
			fmt.Println("FAIL")
			fmt.Fprintf(os.Stderr, "%s\n", output)
			os.Exit(1)
		}
		fmt.Println("OK")
	}

	fmt.Println("\nBuild successful!")
}

func runLint() {
	// Check if golangci-lint is available
	if _, err := exec.LookPath("golangci-lint"); err != nil {
		fmt.Println("golangci-lint not found, falling back to go vet...")
		runGoCommand([]string{"vet", "./..."})
		return
	}

	fmt.Println("Running golangci-lint...")

	cmd := exec.Command("golangci-lint", "run", "./...")
	cmd.Dir = getServerGoDir()
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			os.Exit(exitErr.ExitCode())
		}
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func runFmt() {
	fmt.Println("Running gofmt...")
	runGoCommand([]string{"fmt", "./..."})
}

// ============================================================================
// Database Commands
// ============================================================================

func runDBStatus() {
	fmt.Println("Database Status")
	fmt.Println("===============")

	dbURL := buildDBURL()
	if dbURL == "" {
		fmt.Println("\nError: Database credentials not configured")
		fmt.Println("Set POSTGRES_PASSWORD or DATABASE_URL environment variable")
		os.Exit(1)
	}

	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		fmt.Printf("\nConnection Error: %v\n", err)
		os.Exit(1)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), defaultTimeout)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		fmt.Printf("\nPing Error: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("\nConnection: OK")

	// Get version
	var version string
	if err := db.QueryRowContext(ctx, "SELECT version()").Scan(&version); err == nil {
		fmt.Printf("Version: %s\n", version)
	}

	// Get database size
	var dbName, dbSize string
	err = db.QueryRowContext(ctx, `
		SELECT current_database(), pg_size_pretty(pg_database_size(current_database()))
	`).Scan(&dbName, &dbSize)
	if err == nil {
		fmt.Printf("Database: %s (%s)\n", dbName, dbSize)
	}

	// Get table counts
	var tableCount int
	err = db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM information_schema.tables 
		WHERE table_schema IN ('kb', 'core', 'public') 
		AND table_type = 'BASE TABLE'
	`).Scan(&tableCount)
	if err == nil {
		fmt.Printf("Tables: %d\n", tableCount)
	}

	// Get migration version
	var migrationVersion int64
	err = db.QueryRowContext(ctx, `
		SELECT COALESCE(MAX(version_id), 0) FROM goose_db_version WHERE is_applied = true
	`).Scan(&migrationVersion)
	if err == nil {
		fmt.Printf("Migration Version: %d\n", migrationVersion)
	}
}

// ============================================================================
// Helpers
// ============================================================================

func runGoCommand(args []string) {
	runGoCommandWithEnv(args, os.Environ())
}

func runGoCommandWithEnv(args []string, env []string) {
	cmd := exec.Command("go", args...)
	cmd.Dir = getServerGoDir()
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Env = env

	if err := cmd.Run(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			os.Exit(exitErr.ExitCode())
		}
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func getServerGoDir() string {
	// Try to find server-go directory
	if _, err := os.Stat("go.mod"); err == nil {
		return "."
	}
	if _, err := os.Stat("apps/server-go/go.mod"); err == nil {
		return "apps/server-go"
	}
	// Assume we're already in the right directory
	return "."
}

func buildDBURL() string {
	if dbURL := os.Getenv("DATABASE_URL"); dbURL != "" {
		return dbURL
	}

	host := getEnvDefault("DB_HOST", "localhost")
	port := getEnvDefault("DB_PORT", "5432")
	user := getEnvDefault("POSTGRES_USER", "emergent")
	pass := os.Getenv("POSTGRES_PASSWORD")
	name := getEnvDefault("POSTGRES_DATABASE", "emergent")
	sslMode := getEnvDefault("DB_SSL_MODE", "disable")

	if pass == "" {
		return ""
	}

	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
		user, pass, host, port, name, sslMode)
}

func getEnvDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func printUsage() {
	usage := `Go Server Tasks CLI

Usage: go run ./cmd/tasks <command> [options]

Commands:
  health, hc        Check server health
  test              Run all tests
  test:e2e          Run E2E tests (against running server)
  test:unit         Run unit tests only
  build             Build the server
  lint              Run golangci-lint
  fmt               Run gofmt
  db:status         Check database status

Health Check Options:
  -url string       Server URL (default: http://localhost:3002)
  -v                Verbose output (show response bodies)
  -db               Also check database connectivity

Test Options:
  -v                Verbose output
  -run string       Run only tests matching pattern
  -count int        Run tests N times (default: 1)

E2E Test Options:
  -external         Test against external server (default: true)
  -url string       External server URL (default: http://localhost:3002)
  -run string       Run specific suite (e.g., TestDocumentsSuite)

Examples:
  # Check if server is healthy
  go run ./cmd/tasks health

  # Check server and database health with verbose output
  go run ./cmd/tasks health -v -db

  # Run all E2E tests against running server
  go run ./cmd/tasks test:e2e

  # Run specific test suite
  go run ./cmd/tasks test:e2e -run TestDocumentsSuite

  # Run specific test within a suite
  go run ./cmd/tasks test:e2e -run "TestDocumentsSuite/TestCreate"

  # Run unit tests only
  go run ./cmd/tasks test:unit

  # Check database status
  go run ./cmd/tasks db:status

Quick Health Check:
  go run ./cmd/tasks hc
`
	// Remove leading/trailing newlines and indent
	fmt.Println(strings.TrimSpace(usage))
}

package config

import "fmt"

// ServerCmd is the subcommand for running the HTTP/MCP server.
type ServerCmd struct{}

// DBCmd is the subcommand for database operations.
type DBCmd struct {
	Migrate bool `arg:"--migrate" help:"Run pending migrations and exit"`
	Reset   bool `arg:"--reset" help:"Drop and recreate the database (dev only)"`
}

// ImportCmd is the subcommand for importing a local EPF instance into the database.
type ImportCmd struct {
	InstancePath string `arg:"--instance-path,required,env:IMPORT_INSTANCE_PATH" help:"Path to the local EPF instance directory"`
	GithubOwner  string `arg:"--workspace,required,env:IMPORT_WORKSPACE" help:"GitHub owner / workspace slug (e.g. emergent-company)"`
	InstanceName string `arg:"--name,env:IMPORT_INSTANCE_NAME" help:"Override the instance display name (default: product name from _meta.yaml)"`
	Activate     bool   `arg:"--activate,env:IMPORT_ACTIVATE" default:"false" help:"Activate the instance after import"`
}

// Config is the top-level configuration struct parsed by go-arg.
// All fields bind to environment variables automatically.
type Config struct {
	Server *ServerCmd `arg:"subcommand:server" help:"Start the HTTP and MCP server"`
	DB     *DBCmd     `arg:"subcommand:db" help:"Database management commands"`
	Import *ImportCmd `arg:"subcommand:import" help:"Import a local EPF instance into the database"`

	// General
	LogLevel string `arg:"--log-level,env:LOG_LEVEL" default:"INFO" help:"Log level: DEBUG, INFO, WARN, ERROR"`
	Env      string `arg:"--env,env:ENV" default:"development" help:"Runtime environment: development, production"`

	// Database
	PGHost    string `arg:"--pg-host,env:PGHOST" default:"localhost" help:"PostgreSQL host"`
	PGPort    int    `arg:"--pg-port,env:PGPORT" default:"5432" help:"PostgreSQL port"`
	PGUser    string `arg:"--pg-user,env:PGUSER" default:"strategy" help:"PostgreSQL user"`
	PGPass    string `arg:"--pg-password,env:PGPASSWORD" default:"strategy" help:"PostgreSQL password"`
	PGDBName  string `arg:"--pg-database,env:PGDATABASE" default:"strategy" help:"PostgreSQL database name"`
	PGSSLMode string `arg:"--pg-sslmode,env:PGSSLMODE" default:"disable" help:"PostgreSQL SSL mode"`

	// HTTP Server
	Port      int    `arg:"--port,env:PORT" default:"8080" help:"HTTP listen port"`
	ServerURL string `arg:"--server-url,env:SERVER_URL" help:"Public base URL of this server"`

	// Auth
	AuthEnabled bool `arg:"--auth-enabled,env:AUTH_ENABLED" default:"false" help:"Enable GitHub OAuth authentication"`

	// GitHub OAuth
	GithubClientID     string `arg:"env:EPF_OAUTH_CLIENT_ID" help:"GitHub OAuth App client ID"`
	GithubClientSecret string `arg:"env:EPF_OAUTH_CLIENT_SECRET" help:"GitHub OAuth App client secret"`
	SessionSecret      string `arg:"env:EPF_SESSION_SECRET" help:"Session signing secret (64+ hex chars)"`

	// emergent.memory (semantic graph)
	MemoryURL     string `arg:"env:EPF_MEMORY_URL" help:"emergent.memory base URL"`
	MemoryProject string `arg:"env:EPF_MEMORY_PROJECT" help:"emergent.memory project ID"`
	MemoryToken   string `arg:"env:EPF_MEMORY_TOKEN" help:"emergent.memory project token"`
}

// PostgresDSN returns a valid PostgreSQL DSN from the config.
func (c *Config) PostgresDSN() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%d/%s?sslmode=%s",
		c.PGUser, c.PGPass, c.PGHost, c.PGPort, c.PGDBName, c.PGSSLMode)
}

// IsDev returns true when running in development mode.
func (c *Config) IsDev() bool {
	return c.Env == "development"
}

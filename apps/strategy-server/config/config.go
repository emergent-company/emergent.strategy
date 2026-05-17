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
	Org          string `arg:"--org,env:IMPORT_ORG" help:"Organisation name or UUID to link this import to"`
	OrgNumber    string `arg:"--org-number,env:IMPORT_ORG_NUMBER" help:"Norwegian organisation number (for org enrichment)"`
	Country      string `arg:"--country,env:IMPORT_COUNTRY" help:"ISO country code (default: NO)"`
	Activate     bool   `arg:"--activate,env:IMPORT_ACTIVATE" default:"false" help:"Activate the instance after import"`
	Reingest     bool   `arg:"--reingest,env:IMPORT_REINGEST" default:"false" help:"Ingest artifacts into Memory graph after import"`
}

// DBMode controls how strategy-server co-locates with emergent.memory's database.
type DBMode string

const (
	// DBModeShared uses a single Postgres instance shared with Memory.
	// Strategy-server reads user/org data from Memory's core/kb schemas.
	DBModeShared DBMode = "shared"

	// DBModeStandalone uses a separate Postgres instance for strategy-server.
	// No cross-schema reads; user/org data is stored in strategy schema.
	DBModeStandalone DBMode = "standalone"

	// DBModeDev is the default development mode — no auth, no Memory required.
	DBModeDev DBMode = "dev"
)

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
	PGPort    int    `arg:"--pg-port,env:PGPORT" default:"5433" help:"PostgreSQL port"`
	PGUser    string `arg:"--pg-user,env:PGUSER" default:"strategy" help:"PostgreSQL user"`
	PGPass    string `arg:"--pg-password,env:PGPASSWORD" default:"strategy" help:"PostgreSQL password"`
	PGDBName  string `arg:"--pg-database,env:PGDATABASE" default:"strategy" help:"PostgreSQL database name"`
	PGSSLMode string `arg:"--pg-sslmode,env:PGSSLMODE" default:"disable" help:"PostgreSQL SSL mode"`

	// Database mode — controls Memory co-location strategy.
	StrategyDBMode string `arg:"--db-mode,env:STRATEGY_DB_MODE" default:"dev" help:"Database mode: shared, standalone, dev"`

	// HTTP Server
	Port      int    `arg:"--port,env:PORT" default:"8080" help:"HTTP listen port"`
	ServerURL string `arg:"--server-url,env:SERVER_URL" help:"Public base URL of this server"`

	// Auth
	AuthEnabled bool `arg:"--auth-enabled,env:AUTH_ENABLED" default:"false" help:"Enable authentication"`

	// Zitadel OIDC
	ZitadelIssuer       string `arg:"env:ZITADEL_ISSUER" help:"Zitadel issuer URL (e.g. https://auth.example.com)"`
	ZitadelClientID     string `arg:"env:ZITADEL_CLIENT_ID" help:"Zitadel service account client ID"`
	ZitadelKeyPath      string `arg:"env:ZITADEL_KEY_PATH" help:"Path to Zitadel JWT key file"`
	ZitadelDebugToken   string `arg:"env:ZITADEL_DEBUG_TOKEN" help:"Debug token for integration tests (non-production only)"`
	IntrospectionCacheTTL int  `arg:"env:INTROSPECTION_CACHE_TTL" default:"300" help:"Token introspection cache TTL in seconds"`

	// GitHub App (for repo sync / write-back)
	GithubAppID            int64  `arg:"env:GITHUB_APP_ID" help:"GitHub App ID for repo sync"`
	GithubAppPrivateKeyPath string `arg:"env:GITHUB_APP_PRIVATE_KEY_PATH" help:"Path to GitHub App PEM private key file"`

	// GitHub OAuth (deprecated — kept for migration period)
	GithubClientID     string `arg:"env:EPF_OAUTH_CLIENT_ID" help:"GitHub OAuth App client ID (deprecated)"`
	GithubClientSecret string `arg:"env:EPF_OAUTH_CLIENT_SECRET" help:"GitHub OAuth App client secret (deprecated)"`
	SessionSecret      string `arg:"env:EPF_SESSION_SECRET" help:"Session signing secret (deprecated)"`

	// emergent.memory (semantic graph)
	MemoryURL      string `arg:"env:EPF_MEMORY_URL" default:"http://localhost:3002" help:"emergent.memory base URL"`
	MemoryProject  string `arg:"env:EPF_MEMORY_PROJECT" help:"emergent.memory project ID"`
	MemoryToken    string `arg:"env:EPF_MEMORY_TOKEN" help:"emergent.memory project token"`
	MemoryAuthMode string `arg:"env:EPF_MEMORY_AUTH_MODE" default:"api-key" help:"Memory auth mode: api-key (standalone) or bearer (production)"`

	// LLM provider (for server-orchestrated convergence loop resolution)
	LLMProviderURL string `arg:"env:LLM_PROVIDER_URL" help:"LLM API base URL (OpenAI-compatible, e.g. https://api.openai.com or http://localhost:11434 for Ollama)"`
	LLMAPIKey      string `arg:"env:LLM_API_KEY" help:"LLM API key (Bearer token; empty for Ollama local)"`
	LLMModel       string `arg:"env:LLM_MODEL" default:"gpt-4o-mini" help:"LLM model name (e.g. gpt-4o-mini, claude-sonnet-4-20250514, llama3.2:8b)"`
}

// LLMConfigured returns true when LLM provider settings are provided.
func (c *Config) LLMConfigured() bool {
	return c.LLMProviderURL != ""
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

// GetDBMode returns the parsed database mode. Defaults to DBModeDev for invalid values.
func (c *Config) GetDBMode() DBMode {
	switch DBMode(c.StrategyDBMode) {
	case DBModeShared:
		return DBModeShared
	case DBModeStandalone:
		return DBModeStandalone
	case DBModeDev:
		return DBModeDev
	default:
		return DBModeDev
	}
}

// MemoryConfigured returns true when Memory connection settings are provided.
func (c *Config) MemoryConfigured() bool {
	return c.MemoryURL != "" && c.MemoryProject != "" && c.MemoryToken != ""
}

// ZitadelConfigured returns true when Zitadel OIDC settings are provided.
func (c *Config) ZitadelConfigured() bool {
	return c.ZitadelIssuer != "" && c.ZitadelClientID != ""
}

// GithubAppConfigured returns true when GitHub App settings are provided.
func (c *Config) GithubAppConfigured() bool {
	return c.GithubAppID != 0 && c.GithubAppPrivateKeyPath != ""
}

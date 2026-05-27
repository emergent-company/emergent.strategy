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
	Activate     bool   `arg:"--activate,env:IMPORT_ACTIVATE" default:"true" help:"Activate the instance after import"`
	Reingest     bool   `arg:"--reingest,env:IMPORT_REINGEST" default:"true" help:"Ingest artifacts into Memory graph after import (skipped when Memory is not configured)"`
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
	Port      int    `arg:"--port,env:PORT" default:"8090" help:"HTTP listen port"`
	ServerURL string `arg:"--server-url,env:SERVER_URL" help:"Public base URL of this server"`

	// Auth
	AuthEnabled bool `arg:"--auth-enabled,env:AUTH_ENABLED" default:"false" help:"Enable authentication"`

	// Zitadel OIDC
	ZitadelIssuer         string `arg:"env:ZITADEL_ISSUER" help:"Zitadel issuer URL (e.g. https://auth.example.com)"`
	ZitadelClientID       string `arg:"env:ZITADEL_CLIENT_ID" help:"Zitadel service account client ID"`
	ZitadelKeyPath        string `arg:"env:ZITADEL_KEY_PATH" help:"Path to Zitadel JWT key file"`
	ZitadelDebugToken     string `arg:"env:ZITADEL_DEBUG_TOKEN" help:"Debug token for integration tests (non-production only)"`
	IntrospectionCacheTTL int    `arg:"env:INTROSPECTION_CACHE_TTL" default:"300" help:"Token introspection cache TTL in seconds"`

	// GitHub App (for repo sync / write-back)
	GithubAppID             int64  `arg:"env:GITHUB_APP_ID" help:"GitHub App ID for repo sync"`
	GithubAppPrivateKeyPath string `arg:"env:GITHUB_APP_PRIVATE_KEY_PATH" help:"Path to GitHub App PEM private key file"`
	GithubAppPrivateKey     string `arg:"env:GITHUB_APP_PRIVATE_KEY" help:"GitHub App PEM private key content (inline, alternative to GITHUB_APP_PRIVATE_KEY_PATH)"`
	GithubAppSlug           string `arg:"env:GITHUB_APP_SLUG" help:"GitHub App slug (public name, e.g. 'emergent-strategy-app') — used to generate the installation URL"`

	// GitHub OAuth App (for user-scoped installation discovery in connect flow)
	// Primary env vars: GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET
	// Legacy aliases: EPF_OAUTH_CLIENT_ID / EPF_OAUTH_CLIENT_SECRET (kept for backward compat)
	GithubOAuthClientID     string `arg:"env:GITHUB_OAUTH_CLIENT_ID" help:"GitHub OAuth App client ID for user-scoped installation discovery"`
	GithubOAuthClientSecret string `arg:"env:GITHUB_OAUTH_CLIENT_SECRET" help:"GitHub OAuth App client secret"`
	GithubOAuthStateSecret  string `arg:"env:GITHUB_OAUTH_STATE_SECRET" help:"HMAC secret for OAuth state cookie signing (falls back to EPF_SESSION_SECRET)"`

	// Legacy OAuth fields — kept for backward compat, fall back when new vars not set
	GithubClientID     string `arg:"env:EPF_OAUTH_CLIENT_ID" help:"GitHub OAuth App client ID (legacy — use GITHUB_OAUTH_CLIENT_ID)"`
	GithubClientSecret string `arg:"env:EPF_OAUTH_CLIENT_SECRET" help:"GitHub OAuth App client secret (legacy — use GITHUB_OAUTH_CLIENT_SECRET)"`
	SessionSecret      string `arg:"env:EPF_SESSION_SECRET" help:"Session signing secret (legacy)"`

	// emergent.memory (semantic graph)
	MemoryURL      string `arg:"env:EPF_MEMORY_URL" default:"http://localhost:3002" help:"emergent.memory base URL"`
	MemoryProject  string `arg:"env:EPF_MEMORY_PROJECT" help:"emergent.memory project ID"`
	MemoryToken    string `arg:"env:EPF_MEMORY_TOKEN" help:"emergent.memory project token"`
	MemoryAuthMode string `arg:"env:EPF_MEMORY_AUTH_MODE" default:"api-key" help:"Memory auth mode: api-key (standalone) or bearer (production)"`

	// LLM provider (for server-orchestrated convergence loop resolution)
	LLMProviderURL string `arg:"env:LLM_PROVIDER_URL" help:"LLM API base URL (OpenAI-compatible, e.g. https://api.openai.com or http://localhost:11434 for Ollama)"`
	LLMAPIKey      string `arg:"env:LLM_API_KEY" help:"LLM API key (Bearer token; empty for Ollama local)"`
	LLMModel       string `arg:"env:LLM_MODEL" default:"gpt-4o-mini" help:"LLM model name (e.g. gpt-4o-mini, claude-sonnet-4-20250514, llama3.2:8b)"`

	// Heartbeat (continuous trigger evaluation)
	HeartbeatInterval int `arg:"env:HEARTBEAT_INTERVAL" default:"300" help:"Seconds between heartbeat trigger evaluations (default: 300 = 5 minutes; 0 disables)"`
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
	return c.GithubAppID != 0 && (c.GithubAppPrivateKeyPath != "" || c.GithubAppPrivateKey != "")
}

// GithubAppInstallURL returns the GitHub App installation URL when the slug is configured.
// Returns empty string when GITHUB_APP_SLUG is not set.
func (c *Config) GithubAppInstallURL() string {
	if c.GithubAppSlug == "" {
		return ""
	}
	return fmt.Sprintf("https://github.com/apps/%s/installations/new", c.GithubAppSlug)
}

// GithubOAuthConfigured returns true when GitHub OAuth App credentials are available.
// Checks new env vars first, falls back to legacy EPF_OAUTH_CLIENT_ID.
func (c *Config) GithubOAuthConfigured() bool {
	return c.effectiveOAuthClientID() != "" && c.effectiveOAuthClientSecret() != ""
}

// effectiveOAuthClientID returns the OAuth client ID, preferring new vars over legacy.
func (c *Config) effectiveOAuthClientID() string {
	if c.GithubOAuthClientID != "" {
		return c.GithubOAuthClientID
	}
	return c.GithubClientID
}

// effectiveOAuthClientSecret returns the OAuth client secret, preferring new vars over legacy.
func (c *Config) effectiveOAuthClientSecret() string {
	if c.GithubOAuthClientSecret != "" {
		return c.GithubOAuthClientSecret
	}
	return c.GithubClientSecret
}

// effectiveOAuthStateSecret returns the state HMAC secret.
// Falls back to EPF_SESSION_SECRET if GITHUB_OAUTH_STATE_SECRET is not set.
func (c *Config) EffectiveOAuthStateSecret() string {
	if c.GithubOAuthStateSecret != "" {
		return c.GithubOAuthStateSecret
	}
	return c.SessionSecret
}

// GithubOAuthClientID returns the effective OAuth App client ID.
func (c *Config) EffectiveOAuthClientID() string { return c.effectiveOAuthClientID() }

// EffectiveOAuthClientSecret returns the effective OAuth App client secret.
func (c *Config) EffectiveOAuthClientSecret() string { return c.effectiveOAuthClientSecret() }

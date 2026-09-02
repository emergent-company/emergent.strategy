package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"
	"github.com/uptrace/bun"
	"golang.org/x/oauth2/google"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/config"
	activitydom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/activity"
	aimdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	appdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/app"
	evidencedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/evidence"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/heartbeat"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/pack"
	rippledom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ripple"
	schemadom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/schema"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/skillexec"
	skillrundom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/skillrun"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/user"
	versiondom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	watchdogdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/watchdog"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/auth"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	ghclient "github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/github"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/handler"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/llm"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/skillrunner"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/logger"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
	orchpg "github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration/pg"
)

func runServer(cfg *config.Config) error {
	log := logger.New(cfg.LogLevel)
	slog.SetDefault(log)

	log.Info("starting strategy-server", "env", cfg.Env, "port", cfg.Port)

	// Database
	db, err := database.Open(cfg)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer func() { _ = db.Close() }()

	if err := database.Migrate(db); err != nil {
		return fmt.Errorf("run migrations: %w", err)
	}

	// Schema registry — auto-imports embedded schemas on first run.
	schemaSvc := schemadom.NewService(db)
	if err := schemaSvc.EnsureImported(context.Background()); err != nil {
		log.Warn("schema registry auto-import failed (non-fatal)", "err", err)
	}

	// Audit writer — persists to audit_log table.
	auditWriter := audit.NewDBWriter(db)

	// Warn at startup if script interpreters are missing.
	skillrunner.WarnMissingInterpreters()

	// Domain services.
	packSvc := pack.NewService(db)
	instSvc := instance.NewService(db)
	instSvc.WithPackEnsurer(packSvc) // post-commit standard pack auto-install

	semanticSvc := setupSemantic(cfg, log)

	// Ingestion pipeline: converts committed mutations into Memory graph objects.
	ingestSvc := ingest.NewService(db, semanticSvc.Client())
	ingestSvc.Start(2) // 2 worker goroutines
	defer ingestSvc.Stop()

	// Startup sweep: enqueue a full re-ingest for every active instance so that
	// Memory stays in sync after server restarts or first-time setup.
	if semanticSvc.IsAvailable() {
		go ingestSvc.EnqueueAllInstances(context.Background(), db, log)
	}

	orgSvc := org.NewService(db)
	versionSvc := versiondom.NewService(db)
	strategySvc := strategy.NewService(db)
	rippleSvc := rippledom.NewService(db)

	// Wire the strategy exporter into the ingest service for decomposed-layer sync.
	if semanticSvc.IsAvailable() {
		ingestSvc.SetExporter(&strategyExporterAdapter{svc: strategySvc})
	}

	// LLM provider — enables server-orchestrated convergence loop resolution.
	llmClient := setupLLM(cfg, log)

	// GitHub sync — only available when GitHub App is configured.
	syncSvc := setupGitHubSync(cfg, log, db, strategySvc, versionSvc, instSvc)

	wsSvc := workspace.NewService(db)

	// AIM agent loop service — delegates writing to canonical skills via SkillRunner.
	aimSvc := aimdom.NewService(db).WithVersionPublisher(versionSvc)
	// Wire GitHub auto-push: when syncSvc is configured, AIM cycles auto-push to GitHub.
	if syncSvc != nil {
		aimSvc = aimSvc.WithGitHubSyncer(syncSvc)
	}

	// Evidence service — created early so heartbeat can use it for proposal context.
	evidenceSvc := evidencedom.NewService(db).WithMemoryEnqueue(ingestSvc)

	// Activity stream — records significant loop events; feeds SSE fanout.
	activitySvc := activitydom.NewService(db)

	// Heartbeat — periodic trigger evaluation across all active instances.
	heartbeatSvc := heartbeat.NewService(db, &aimHeartbeatAdapter{svc: aimSvc}).
		WithEvidenceCounter(evidenceSvc).
		WithActivityRecorder(&heartbeatActivityAdapter{svc: activitySvc}).
		WithConsistencyChecker(strategySvc).
		WithMemoryDriftRepairer(ingestSvc)
	if cfg.HeartbeatInterval > 0 {
		heartbeatCtx, heartbeatStop := context.WithCancel(context.Background())
		defer heartbeatStop()
		go heartbeatSvc.RunTicker(heartbeatCtx, time.Duration(cfg.HeartbeatInterval)*time.Second)
		log.Info("heartbeat ticker started", "interval_s", cfg.HeartbeatInterval)
	} else {
		log.Info("heartbeat disabled (HEARTBEAT_INTERVAL=0)")
	}

	// Orchestration engine — PostgreSQL-backed goroutine pool.
	orchBackend := orchpg.NewBackend(db, orchpg.Config{Workers: 4})
	orchEngine := orchestration.New(orchBackend)
	// Skill run ledger — tracks all autonomous skill executions.
	skillRunSvc := skillrundom.NewService(db)
	skillRunLedger := skillrundom.NewAdapter(skillRunSvc)

	// Unified skill executor — drives the adapt_strategy step in the AIM cycle.
	// Uses a separate LLM client with a longer timeout: skill prompts are large
	// (full artifact JSON + schema constraints) and routinely exceed 60 seconds.
	var skillExecutor *skillexec.Executor
	// Nil-check the concrete *llm.Client before it reaches the llm.Provider
	// field: a typed nil pointer would become a non-nil interface and panic
	// deep inside skillexec rather than degrading to skeleton mode here.
	var skillLLMClient *llm.Client
	if llmClient != nil {
		skillLLMCfg, _ := buildLLMConfig(cfg) // llmClient!=nil ⇒ config already valid
		skillLLMCfg.Timeout = 5 * time.Minute
		skillLLMClient = llm.New(skillLLMCfg)
	}
	if skillLLMClient != nil {
		skillLLMAdapter := &skillexecLLMAdapter{client: skillLLMClient}
		skillExecutor = skillexec.New(db, packSvc, skillLLMAdapter).
			WithActivityRecorder(activitySvc).
			WithRunLedger(skillRunLedger).
			WithModel(skillLLMClient.Model())
		log.Info("skill executor enabled (autonomous mode)")
	} else {
		skillExecutor = skillexec.New(db, packSvc, nil). // skeleton mode
									WithActivityRecorder(activitySvc).
									WithRunLedger(skillRunLedger)
		log.Info("skill executor in skeleton mode (no LLM configured)")
	}

	// Wire executor into AIM service so DraftAssessment/DraftCalibration route
	// through canonical skills with full run tracking.
	aimSvc.WithSkillRunner(&aimSkillRunnerAdapter{executor: skillExecutor})

	orchEngine.Register(aimdom.NewCycleWorkflow(aimSvc, skillExecutor).
		WithPortfolioAligner(&strategyPortfolioAlignerAdapter{svc: strategySvc}))
	if err := orchEngine.Start(context.Background()); err != nil {
		return fmt.Errorf("start orchestration engine: %w", err)
	}

	// Clean up zombie skill runs left over from a previous crash/restart.
	// The orchestration engine already marks stale orchestration_runs as failed,
	// but skill_runs are a separate table and need their own cleanup.
	if staleCount, staleErr := skillRunSvc.MarkStaleRunsFailed(context.Background()); staleErr != nil {
		log.Warn("failed to clean stale skill runs (non-fatal)", "err", staleErr)
	} else if staleCount > 0 {
		log.Warn("orchestration: marked stale runs as failed on startup", "count", staleCount)
	}

	// Wire active-run checker into heartbeat so it suppresses proposal creation
	// when a cycle is already running for an instance.
	heartbeatSvc.WithActiveRunChecker(&heartbeatActiveRunAdapter{engine: orchEngine})
	defer func() {
		stopCtx, stopCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer stopCancel()
		if stopErr := orchEngine.Stop(stopCtx); stopErr != nil {
			log.Warn("orchestration engine stop error", "err", stopErr)
		}
	}()

	svc := mcpserver.Services{
		Workspace:           wsSvc,
		Instance:            instSvc,
		Strategy:            strategySvc,
		Pack:                packSvc,
		App:                 appdom.NewService(db),
		Semantic:            semanticSvc,
		Org:                 orgSvc,
		Schema:              schemaSvc,
		Version:             versionSvc,
		Sync:                syncSvc,
		Ripple:              rippleSvc,
		AIM:                 aimSvc,
		SkillExecutor:       skillExecutor,
		SkillRun:            skillRunSvc,
		Heartbeat:           heartbeatSvc,
		Resolver:            rippledom.NewLLMResolver(llmClient, db),
		Ingest:              ingestSvc,
		Orchestration:       orchEngine,
		Evidence:            evidenceSvc,
		Activity:            activitySvc,
		Watchdog:            watchdogdom.NewService(db),
		GithubAppInstallURL: cfg.GithubAppInstallURL(),
	}

	// Echo instance.
	e := echo.New()
	e.HideBanner = true
	e.HidePort = true

	// Global middleware.
	e.Use(echomw.Recover())
	e.Use(echomw.RequestID())
	e.Use(echomw.RequestLoggerWithConfig(echomw.RequestLoggerConfig{
		LogStatus:    true,
		LogURI:       true,
		LogMethod:    true,
		LogLatency:   true,
		LogRemoteIP:  true,
		LogRequestID: true,
		LogValuesFunc: func(c echo.Context, v echomw.RequestLoggerValues) error {
			slog.InfoContext(c.Request().Context(), "request",
				"id", v.RequestID,
				"method", v.Method,
				"uri", v.URI,
				"status", v.Status,
				"latency_ms", v.Latency.Milliseconds(),
				"remote_ip", v.RemoteIP,
			)
			return nil
		},
	}))
	e.Use(echomw.CORSWithConfig(echomw.CORSConfig{
		AllowOrigins: []string{"*"},
		AllowMethods: []string{http.MethodGet, http.MethodPost, http.MethodDelete, http.MethodOptions},
		AllowHeaders: []string{"Content-Type", "Authorization", "Mcp-Session-Id"},
	}))

	// Inject audit writer into every request context.
	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			ctx := audit.ContextWithAudit(c.Request().Context(), auditWriter)
			c.SetRequest(c.Request().WithContext(ctx))
			return next(c)
		}
	})

	// Auth — Zitadel introspection (if configured).
	var introspector *auth.Introspector
	if cfg.ZitadelConfigured() {
		var intrErr error
		introspector, intrErr = auth.NewIntrospector(auth.Config{
			Issuer:     cfg.ZitadelIssuer,
			ClientID:   cfg.ZitadelClientID,
			KeyPath:    cfg.ZitadelKeyPath,
			DebugToken: cfg.ZitadelDebugToken,
			CacheTTL:   time.Duration(cfg.IntrospectionCacheTTL) * time.Second,
		}, db)
		if intrErr != nil {
			return fmt.Errorf("create introspector: %w", intrErr)
		}
	}

	// User service for EnsureUser on auth.
	userSvc := user.NewService(db)
	ensureUser := func(ctx context.Context, sub, email, name string) (uuid.UUID, error) {
		u, err := userSvc.EnsureUser(ctx, sub, email, name)
		if err != nil {
			return uuid.Nil, err
		}
		return u.ID, nil
	}

	// In dev mode, ensure the dev user exists in the DB so FK constraints on
	// created_by columns don't fail. EnsureUser is idempotent.
	if !cfg.AuthEnabled {
		seedDevIdentity(log, db, auditWriter, userSvc, orgSvc, wsSvc)
	}

	// Auth middleware — injects User + ActorID.
	e.Use(web.AuthMiddleware(cfg.AuthEnabled, introspector, ensureUser))

	// Audit source middleware — sets source = mcp or web by path prefix.
	e.Use(web.AuditMiddleware())

	// i18n locale middleware.
	e.Use(web.LangMiddleware())

	// Health endpoint — reports postgres, memory, and LLM subsystem status.
	// Returns 200 when all required systems are healthy, 503 when degraded.
	e.GET("/health", healthHandler(db, semanticSvc, llmClient))

	// MCP endpoint — mounted at /mcp.
	mcpHandler := mcpserver.New(svc)
	e.Any("/mcp", echo.WrapHandler(mcpHandler))
	e.Any("/mcp/*", echo.WrapHandler(mcpHandler))

	// Static assets — local CSS overrides, go-daisy JS/fonts fallback.
	e.GET("/static/*", echo.WrapHandler(web.StaticHandler()))

	// Web UI routes.
	// Set system-wide flags for the UI layer (persistent banners, degraded-mode indicators).
	ui.SetSystemConfig(ui.SystemConfig{
		MemoryConfigured: semanticSvc.IsAvailable(),
		LLMConfigured:    llmClient != nil,
	})

	// GitHub OAuth App config — for user-scoped installation discovery.
	var ghOAuthCfg *ghclient.OAuthConfig
	if cfg.GithubOAuthConfigured() {
		ghOAuthCfg = &ghclient.OAuthConfig{
			ClientID:     cfg.EffectiveOAuthClientID(),
			ClientSecret: cfg.EffectiveOAuthClientSecret(),
			StateSecret:  cfg.EffectiveOAuthStateSecret(),
			RedirectURL:  cfg.ServerURL + "/github/connect/callback",
		}
		log.Info("github oauth configured", "client_id", cfg.EffectiveOAuthClientID())
	}

	webHandler := handler.New(db, log, semanticSvc).
		WithStrategy(strategySvc).
		WithVersion(versionSvc).
		WithRipple(rippleSvc).
		WithAIM(aimSvc).
		WithHeartbeat(heartbeatSvc).
		WithOrchestration(orchEngine).
		WithActivity(activitySvc).
		WithSkillRun(skillRunSvc).
		WithSkillExecutor(skillExecutor).
		WithEvidence(evidenceSvc).
		WithLLMEnabled(llmClient != nil).
		WithSync(syncSvc).
		WithUserSvc(userSvc).
		WithGithubOAuth(ghOAuthCfg).
		WithGithubAppInstallURL(cfg.GithubAppInstallURL())
	webHandler.RegisterRoutes(e)

	// Server timeouts.
	// WriteTimeout is set to 15 minutes to accommodate the /github/connect/repos
	// endpoint, which scans all of a user's GitHub repos and can take several
	// minutes for large organisations. All other endpoints complete in <5 s.
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      e,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Minute,
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		log.Info("listening", "addr", srv.Addr)
		if err := e.StartServer(srv); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("server error", "err", err)
			stop()
		}
	}()

	<-ctx.Done()

	log.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := e.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown: %w", err)
	}

	log.Info("shutdown complete")
	return nil
}

// setupSemantic constructs the semantic service from config and verifies Memory
// schema availability at startup (non-blocking).
func setupSemantic(cfg *config.Config, log *slog.Logger) *semantic.Service {
	semanticSvc := semantic.NewService(semantic.Config{
		URL:      cfg.MemoryURL,
		Project:  cfg.MemoryProject,
		Token:    cfg.MemoryToken,
		AuthMode: cfg.MemoryAuthMode,
	})

	// Verify Memory schemas at startup (non-blocking — logs warning if unavailable).
	if semanticSvc.IsAvailable() {
		if err := semanticSvc.VerifySchemas(context.Background()); err != nil {
			log.Warn("semantic schema verification failed (non-fatal)", "err", err)
		}
	} else {
		log.Warn("MEMORY NOT CONFIGURED — semantic search, contradiction detection, scenarios, and graph ingestion are disabled. " +
			"Set EPF_MEMORY_URL, EPF_MEMORY_PROJECT, and EPF_MEMORY_TOKEN in .env.local or environment. " +
			"Run 'task dev-up-full' for a complete local setup.")
	}

	return semanticSvc
}

// buildLLMConfig translates app config into an llm.Config, resolving Google
// Vertex AI Application Default Credentials when LLM_AUTH_MODE=vertex. In Vertex
// mode the endpoint is derived from project+location, auth is an auto-refreshing
// ADC token source, and the completions path is Vertex's "/chat/completions".
func buildLLMConfig(cfg *config.Config) (llm.Config, error) {
	if cfg.IsVertexLLM() {
		creds, err := google.FindDefaultCredentials(context.Background(),
			"https://www.googleapis.com/auth/cloud-platform")
		if err != nil {
			return llm.Config{}, fmt.Errorf("vertex: load application default credentials: %w", err)
		}
		return llm.Config{
			BaseURL:         cfg.VertexBaseURL(),
			TokenSource:     creds.TokenSource,
			CompletionsPath: "/chat/completions",
			Model:           cfg.LLMModel,
		}, nil
	}
	return llm.Config{
		BaseURL: cfg.LLMProviderURL,
		APIKey:  cfg.LLMAPIKey,
		Model:   cfg.LLMModel,
	}, nil
}

// setupLLM constructs the LLM provider when configured. Returns nil when the LLM
// provider is not configured (convergence then runs in agent-orchestrated mode).
//
// The nil check on the concrete *llm.Client below is deliberate: returning a
// typed nil pointer as a Provider would yield a non-nil interface and defeat
// every `provider != nil` check downstream.
func setupLLM(cfg *config.Config, log *slog.Logger) llm.Provider {
	if !cfg.LLMConfigured() {
		log.Info("llm provider not configured — convergence runs in agent-orchestrated mode (detection only)")
		return nil
	}
	llmCfg, cfgErr := buildLLMConfig(cfg)
	if cfgErr != nil {
		log.Error("llm provider configuration failed — LLM-backed features disabled", "err", cfgErr)
		return nil
	}
	llmClient := llm.New(llmCfg)
	if llmClient == nil {
		return nil
	}

	// Preflight: a non-nil client only means the URL was set — it does NOT mean
	// the provider will accept generation requests (the project may be denied,
	// suspended, the key revoked, or the model name invalid). Probe once at boot
	// so the operator sees the real status immediately instead of discovering it
	// when an AIM cycle crashes mid-run. This never blocks startup: LLM is
	// optional and the server degrades to agent-orchestrated/formula mode.
	mode := "api-key"
	endpoint := cfg.LLMProviderURL
	if cfg.IsVertexLLM() {
		mode = "vertex"
		endpoint = cfg.VertexBaseURL()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if pingErr := llmClient.Ping(ctx); pingErr != nil {
		if llm.IsAccessDenied(pingErr) {
			log.Error("llm provider preflight FAILED — access denied. LLM-backed features (AIM adapt-strategy, convergence resolution) will fail until this is fixed",
				"mode", mode, "endpoint", endpoint, "model", cfg.LLMModel, "err", pingErr)
		} else {
			log.Warn("llm provider preflight failed — LLM-backed features may be degraded",
				"mode", mode, "endpoint", endpoint, "model", cfg.LLMModel, "retryable", llm.IsRetryable(pingErr), "err", pingErr)
		}
		// Keep the client: transient failures (rate limit, 5xx) may recover, and
		// the /health endpoint will report live status on each check.
		return llmClient
	}

	log.Info("llm provider enabled and reachable (preflight ok)",
		"mode", mode, "endpoint", endpoint, "model", cfg.LLMModel)
	return llmClient
}

// setupGitHubSync constructs the GitHub sync service when the GitHub App is
// configured. Returns nil when sync is disabled or the client fails to init.
func setupGitHubSync(
	cfg *config.Config,
	log *slog.Logger,
	db *bun.DB,
	strategySvc *strategy.Service,
	versionSvc *versiondom.Service,
	instSvc *instance.Service,
) *syncdom.Service {
	if !cfg.GithubAppConfigured() {
		log.Info("github sync disabled (GITHUB_APP_ID not configured)")
		return nil
	}
	ghClient, ghErr := ghclient.NewClient(ghclient.Config{
		AppID:          cfg.GithubAppID,
		PrivateKeyPath: cfg.GithubAppPrivateKeyPath,
		PrivateKeyPEM:  cfg.GithubAppPrivateKey,
	})
	if ghErr != nil {
		log.Warn("github app client failed to initialize (sync disabled)", "err", ghErr)
		return nil
	}
	syncSvc := syncdom.NewService(db, strategySvc, versionSvc, ghclient.NewRepoWriterAdapter(ghClient))
	syncSvc.WithReader(ghclient.NewRepoReaderAdapter(ghClient))
	syncSvc.WithInstanceReimporter(instSvc)
	log.Info("github sync enabled (read + write)", "app_id", cfg.GithubAppID)
	return syncSvc
}

// seedDevIdentity ensures the dev user, dev org, orphan-workspace adoption, and
// dev memberships exist when auth is disabled. All failures are non-fatal.
func seedDevIdentity(
	log *slog.Logger,
	db *bun.DB,
	auditWriter audit.Writer,
	userSvc *user.Service,
	orgSvc *org.Service,
	wsSvc *workspace.Service,
) {
	devCtx := audit.ContextWithSource(context.Background(), audit.SourceSystem)
	devCtx = audit.ContextWithAudit(devCtx, auditWriter)
	u, devErr := userSvc.EnsureUser(devCtx, web.DevUser.Sub, web.DevUser.Email, web.DevUser.Name)
	if devErr != nil {
		log.Warn("failed to seed dev user (non-fatal)", "err", devErr)
	} else if u.ID != web.DevUser.ID {
		// Override the auto-generated ID to match the hardcoded DevUser.ID
		// so that web.UserFromContext returns a user whose ID matches the DB.
		_, _ = db.NewUpdate().TableExpr("users").
			Set("id = ?", web.DevUser.ID).
			Where("sub = ?", web.DevUser.Sub).
			Exec(devCtx)
		log.Info("dev user seeded", "id", web.DevUser.ID)
	}

	// Ensure dev org exists and adopt orphan workspaces from the migration
	// default org (00000000-...-000000000099).
	devOrg, devOrgErr := orgSvc.EnsureDevOrg(devCtx, web.DevUser.ID)
	if devOrgErr != nil {
		log.Warn("failed to create dev org (non-fatal)", "err", devOrgErr)
		return
	}
	log.Info("dev org ready", "org_id", devOrg.ID, "slug", devOrg.Slug)
	defaultOrgID := uuid.MustParse("00000000-0000-0000-0000-000000000099")
	adopted, adoptErr := wsSvc.AdoptOrphanWorkspaces(devCtx, defaultOrgID, devOrg.ID)
	if adoptErr != nil {
		log.Warn("failed to adopt orphan workspaces (non-fatal)", "err", adoptErr)
	} else if adopted > 0 {
		log.Info("adopted orphan workspaces to dev org", "count", adopted)
	}

	// Ensure dev user is a member of every org that exists in the DB.
	// This covers instances imported under real org IDs (e.g. the
	// Emergent instance) so they're accessible without extra setup.
	joined, joinErr := orgSvc.EnsureDevMembershipForAllOrgs(devCtx, web.DevUser.ID)
	if joinErr != nil {
		log.Warn("failed to ensure dev memberships (non-fatal)", "err", joinErr)
	} else if joined > 0 {
		log.Info("dev user joined additional orgs", "count", joined)
	}
}

// healthHandler returns the /health echo handler reporting postgres, memory, and
// LLM subsystem status. Returns 200 when required systems are healthy, 503 when degraded.
func healthHandler(db *bun.DB, semanticSvc *semantic.Service, llmClient llm.Provider) echo.HandlerFunc {
	return func(c echo.Context) error {
		ctx := c.Request().Context()

		type subsystem struct {
			Status  string `json:"status"`            // "ok" | "degraded" | "disabled"
			Message string `json:"message,omitempty"` // human-readable detail
		}
		type healthResponse struct {
			Status  string               `json:"status"` // "ok" | "degraded"
			Service string               `json:"service"`
			Systems map[string]subsystem `json:"systems"`
		}

		systems := make(map[string]subsystem)
		overallOK := true

		// Postgres — ping via a lightweight DB call.
		if pingErr := db.PingContext(ctx); pingErr != nil {
			systems["postgres"] = subsystem{Status: "degraded", Message: pingErr.Error()}
			overallOK = false
		} else {
			systems["postgres"] = subsystem{Status: "ok"}
		}

		// Memory — check if configured and reachable.
		if semanticSvc.IsAvailable() {
			if memErr := semanticSvc.Ping(ctx); memErr != nil {
				systems["memory"] = subsystem{Status: "degraded", Message: memErr.Error()}
				// Memory is optional — does not fail overall health.
			} else {
				systems["memory"] = subsystem{Status: "ok"}
			}
		} else {
			systems["memory"] = subsystem{Status: "disabled", Message: "EPF_MEMORY_URL not configured"}
		}

		// LLM — live probe. A non-nil client does not guarantee the provider
		// accepts generation (project may be denied/suspended, key revoked, or
		// model invalid), so actually ping it. LLM is optional: a degraded LLM
		// does not fail overall health, but it is surfaced clearly here.
		if llmClient != nil {
			pingCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
			if llmErr := llmClient.Ping(pingCtx); llmErr != nil {
				systems["llm"] = subsystem{Status: "degraded", Message: llmErr.Error()}
			} else {
				systems["llm"] = subsystem{Status: "ok"}
			}
			cancel()
		} else {
			systems["llm"] = subsystem{Status: "disabled", Message: "LLM_PROVIDER_URL not configured"}
		}

		status := "ok"
		httpStatus := http.StatusOK
		if !overallOK {
			status = "degraded"
			httpStatus = http.StatusServiceUnavailable
		}

		return c.JSON(httpStatus, healthResponse{
			Status:  status,
			Service: "strategy-server",
			Systems: systems,
		})
	}
}

// strategyExporterAdapter adapts *strategy.Service to the ingest.InstanceExporter interface.
type strategyExporterAdapter struct {
	svc *strategy.Service
}

func (a *strategyExporterAdapter) ExportInstance(ctx context.Context, instanceID uuid.UUID) (*ingest.ExportResult, error) {
	res, err := a.svc.ExportInstance(ctx, instanceID)
	if err != nil {
		return nil, err
	}
	files := make([]ingest.ExportFile, len(res.Files))
	for i, f := range res.Files {
		files[i] = ingest.ExportFile{
			RelPath: f.RelPath,
			Content: f.Content,
		}
	}
	return &ingest.ExportResult{Files: files}, nil
}

// aimHeartbeatAdapter adapts *aim.Service to the heartbeat.TriggerEvaluator interface.
// The heartbeat package uses its own TriggerState type to avoid a circular import.
type aimHeartbeatAdapter struct {
	svc *aimdom.Service
}

func (a *aimHeartbeatAdapter) EvaluateTriggers(ctx context.Context, instanceID uuid.UUID) heartbeat.TriggerState {
	state := a.svc.EvaluateTriggers(ctx, instanceID)
	return heartbeat.TriggerState{
		Fired:            state.Fired,
		Reason:           state.Reason,
		ReasonMessage:    state.ReasonMessage,
		TriggerSignalIDs: state.TriggerSignalIDs,
		LastAssessmentAt: state.LastAssessmentAt,
	}
}

// skillexecLLMAdapter adapts an llm.Provider to the skillexec.LLMClient
// interface, propagating token usage from llm.ChatResult.
type skillexecLLMAdapter struct {
	client llm.Provider
}

func (a *skillexecLLMAdapter) CompleteJSON(ctx context.Context, systemPrompt, userPrompt string) (skillexec.LLMResult, error) {
	result, err := a.client.ChatWithFormat(ctx, []llm.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}, 0.3, llm.FormatJSON)
	if err != nil {
		return skillexec.LLMResult{}, err
	}
	return skillexec.LLMResult{
		Content:      result.Content,
		InputTokens:  result.InputTokens,
		OutputTokens: result.OutputTokens,
	}, nil
}

// heartbeatActivityAdapter adapts *activity.Service to heartbeat.ActivityRecorder.
// The heartbeat package defines ActivityEvent to avoid importing domain/activity directly.
type heartbeatActivityAdapter struct {
	svc *activitydom.Service
}

func (a *heartbeatActivityAdapter) Record(ctx context.Context, ev heartbeat.ActivityEvent) {
	a.svc.Record(ctx, activitydom.RecordRequest{
		InstanceID: ev.InstanceID,
		EventType:  ev.EventType,
		Payload:    ev.Payload,
	})
}

// aimSkillRunnerAdapter adapts *skillexec.Executor to the aim.SkillRunner interface.
type aimSkillRunnerAdapter struct {
	executor *skillexec.Executor
}

func (a *aimSkillRunnerAdapter) RunChunked(ctx context.Context, instanceID uuid.UUID, skillName string, params map[string]any) (aimdom.SkillRunResult, error) {
	result, err := a.executor.RunChunked(ctx, instanceID, skillName, params)
	if err != nil {
		return aimdom.SkillRunResult{}, err
	}
	return aimdom.SkillRunResult{
		BatchID:          result.BatchID,
		ArtifactTypes:    result.ArtifactTypes,
		LLMUsed:          result.LLMUsed,
		ValidationPassed: result.ValidationPassed,
		InputTokens:      result.InputTokens,
		OutputTokens:     result.OutputTokens,
	}, nil
}

// strategyPortfolioAlignerAdapter adapts *strategy.Service to the aim.PortfolioAligner interface.
// It translates strategy.AlignPortfolioResult → aim.PortfolioAlignResult without
// importing domain/strategy from domain/aim (avoids circular dependency).
type strategyPortfolioAlignerAdapter struct {
	svc *strategy.Service
}

func (a *strategyPortfolioAlignerAdapter) AlignPortfolio(ctx context.Context, instanceID uuid.UUID) (aimdom.PortfolioAlignResult, error) {
	result, err := a.svc.AlignPortfolio(ctx, instanceID)
	if err != nil {
		return aimdom.PortfolioAlignResult{}, err
	}
	return aimdom.PortfolioAlignResult{
		TracksProcessed:  result.TracksProcessed,
		TracksChanged:    result.TracksChanged,
		TotalActivated:   result.TotalActivated,
		TotalDeactivated: result.TotalDeactivated,
		KRsWithTargets:   result.KRsWithTargets,
		NoRoadmap:        result.NoRoadmap,
	}, nil
}

// heartbeatActiveRunAdapter adapts *orchestration.Engine to heartbeat.ActiveRunChecker.
type heartbeatActiveRunAdapter struct {
	engine *orchestration.Engine
}

func (a *heartbeatActiveRunAdapter) HasActiveRun(ctx context.Context, instanceID string) bool {
	active, err := a.engine.ActiveRun(ctx, aimdom.WorkflowName, instanceID)
	return err == nil && active != nil
}

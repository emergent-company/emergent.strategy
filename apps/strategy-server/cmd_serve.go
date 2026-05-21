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

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/config"
	appdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/app"
	aimdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	evidencedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/evidence"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/heartbeat"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/pack"
	rippledom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ripple"
	schemadom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/schema"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/user"
	versiondom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/auth"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	ghclient "github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/github"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/handler"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/llm"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/skillrunner"
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
	}

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
	var llmClient *llm.Client
	if cfg.LLMConfigured() {
		llmClient = llm.New(llm.Config{
			BaseURL: cfg.LLMProviderURL,
			APIKey:  cfg.LLMAPIKey,
			Model:   cfg.LLMModel,
		})
		if llmClient != nil {
			log.Info("llm provider enabled for convergence resolution",
				"url", cfg.LLMProviderURL, "model", cfg.LLMModel)
		}
	} else {
		log.Info("llm provider not configured — convergence runs in agent-orchestrated mode (detection only)")
	}

	// GitHub sync — only available when GitHub App is configured.
	var syncSvc *syncdom.Service
	if cfg.GithubAppConfigured() {
		ghClient, ghErr := ghclient.NewClient(ghclient.Config{
			AppID:          cfg.GithubAppID,
			PrivateKeyPath: cfg.GithubAppPrivateKeyPath,
		})
		if ghErr != nil {
			log.Warn("github app client failed to initialize (sync disabled)", "err", ghErr)
		} else {
			syncSvc = syncdom.NewService(db, strategySvc, versionSvc, ghclient.NewRepoWriterAdapter(ghClient))
			log.Info("github sync enabled", "app_id", cfg.GithubAppID)
		}
	} else {
		log.Info("github sync disabled (GITHUB_APP_ID not configured)")
	}

	wsSvc := workspace.NewService(db)

	// AIM agent loop service — wraps the llmClient as an aim.LLMClient adapter.
	var aimLLMClient aimdom.LLMClient
	if llmClient != nil {
		aimLLMClient = &llmAIMAdapter{client: llmClient}
	}
	aimSvc := aimdom.NewService(db, aimLLMClient).WithVersionPublisher(versionSvc)

	// Evidence service — created early so heartbeat can use it for proposal context.
	evidenceSvc := evidencedom.NewService(db).WithMemoryEnqueue(ingestSvc)

	// Heartbeat — periodic trigger evaluation across all active instances.
	heartbeatSvc := heartbeat.NewService(db, &aimHeartbeatAdapter{svc: aimSvc}).
		WithEvidenceCounter(evidenceSvc)
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
	orchEngine.Register(aimdom.NewCycleWorkflow(aimSvc))
	if err := orchEngine.Start(context.Background()); err != nil {
		return fmt.Errorf("start orchestration engine: %w", err)
	}
	defer func() {
		stopCtx, stopCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer stopCancel()
		if stopErr := orchEngine.Stop(stopCtx); stopErr != nil {
			log.Warn("orchestration engine stop error", "err", stopErr)
		}
	}()

	svc := mcpserver.Services{
		Workspace:     wsSvc,
		Instance:      instSvc,
		Strategy:      strategySvc,
		Pack:          packSvc,
		App:           appdom.NewService(db),
		Semantic:      semanticSvc,
		Org:           orgSvc,
		Schema:        schemaSvc,
		Version:       versionSvc,
		Sync:          syncSvc,
		Ripple:        rippleSvc,
		AIM:           aimSvc,
		Heartbeat:     heartbeatSvc,
		Resolver:      rippledom.NewLLMResolver(llmClient, db),
		Ingest:        ingestSvc,
		Orchestration: orchEngine,
		Evidence:      evidenceSvc,
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
		} else {
			log.Info("dev org ready", "org_id", devOrg.ID, "slug", devOrg.Slug)
			defaultOrgID := uuid.MustParse("00000000-0000-0000-0000-000000000099")
			adopted, adoptErr := wsSvc.AdoptOrphanWorkspaces(devCtx, defaultOrgID, devOrg.ID)
			if adoptErr != nil {
				log.Warn("failed to adopt orphan workspaces (non-fatal)", "err", adoptErr)
			} else if adopted > 0 {
				log.Info("adopted orphan workspaces to dev org", "count", adopted)
			}
		}
	}

	// Auth middleware — injects User + ActorID.
	e.Use(web.AuthMiddleware(cfg.AuthEnabled, introspector, ensureUser))

	// Audit source middleware — sets source = mcp or web by path prefix.
	e.Use(web.AuditMiddleware())

	// i18n locale middleware.
	e.Use(web.LangMiddleware())

	// Health endpoint.
	e.GET("/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]string{
			"status":  "ok",
			"service": "strategy-server",
		})
	})

	// MCP endpoint — mounted at /mcp.
	mcpHandler := mcpserver.New(svc)
	e.Any("/mcp", echo.WrapHandler(mcpHandler))
	e.Any("/mcp/*", echo.WrapHandler(mcpHandler))

	// Static assets — local CSS overrides, go-daisy JS/fonts fallback.
	e.GET("/static/*", echo.WrapHandler(web.StaticHandler()))

	// Web UI routes.
	webHandler := handler.New(db, log, semanticSvc).
		WithStrategy(strategySvc).
		WithVersion(versionSvc).
		WithRipple(rippleSvc).
		WithAIM(aimSvc).
		WithOrchestration(orchEngine).
		WithLLMEnabled(llmClient != nil)
	webHandler.RegisterRoutes(e)

	// Server timeouts.
	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      e,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 180 * time.Second,
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
		Fired:         state.Fired,
		Reason:        state.Reason,
		ReasonMessage: state.ReasonMessage,
	}
}

// llmAIMAdapter adapts *llm.Client to the aim.LLMClient interface.
// The aim package uses a simpler Complete(ctx, system, user) signature
// so handlers don't depend on internal/llm types.
type llmAIMAdapter struct {
	client *llm.Client
}

func (a *llmAIMAdapter) Complete(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	result, err := a.client.Chat(ctx, []llm.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}, 0.4)
	if err != nil {
		return "", err
	}
	return result.Content, nil
}

// CompleteJSON calls the LLM with json_object response_format for structured output.
func (a *llmAIMAdapter) CompleteJSON(ctx context.Context, systemPrompt, userPrompt string) (string, error) {
	result, err := a.client.ChatWithFormat(ctx, []llm.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userPrompt},
	}, 0.3, llm.FormatJSON) // lower temperature for structured output
	if err != nil {
		return "", err
	}
	return result.Content, nil
}

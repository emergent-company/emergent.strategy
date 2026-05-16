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
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/pack"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	schemadom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/schema"
	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/user"
	versiondom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	ghclient "github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/github"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/auth"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/mcpserver"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/skillrunner"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/logger"
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

	orgSvc := org.NewService(db)
	versionSvc := versiondom.NewService(db)
	strategySvc := strategy.NewService(db)

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

	svc := mcpserver.Services{
		Workspace: workspace.NewService(db),
		Instance:  instSvc,
		Strategy:  strategySvc,
		Pack:      packSvc,
		App:       appdom.NewService(db),
		Semantic:  semanticSvc,
		Org:       orgSvc,
		Schema:    schemaSvc,
		Version:   versionSvc,
		Sync:      syncSvc,
		Ingest:    ingestSvc,
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

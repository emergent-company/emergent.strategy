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

	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/config"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/pack"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
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

	// Audit writer — persists to audit_log table.
	auditWriter := audit.NewDBWriter(db)

	// Warn at startup if script interpreters are missing.
	skillrunner.WarnMissingInterpreters()

	// Domain services.
	packSvc := pack.NewService(db)
	instSvc := instance.NewService(db)
	instSvc.WithPackEnsurer(packSvc) // post-commit standard pack auto-install

	svc := mcpserver.Services{
		Workspace: workspace.NewService(db),
		Instance:  instSvc,
		Strategy:  strategy.NewService(db),
		Pack:      packSvc,
		Semantic: semantic.NewService(semantic.Config{
			URL:     cfg.MemoryURL,
			Project: cfg.MemoryProject,
			Token:   cfg.MemoryToken,
		}),
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

	// Auth middleware — injects User + ActorID.
	e.Use(web.AuthMiddleware(cfg.AuthEnabled))

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

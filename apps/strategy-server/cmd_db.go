package main

import (
	"fmt"
	"log/slog"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/config"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/logger"
)

func runDB(cfg *config.Config) error {
	log := logger.New(cfg.LogLevel)
	slog.SetDefault(log)

	db, err := database.Open(cfg)
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}
	defer func() { _ = db.Close() }()

	switch {
	case cfg.DB.Migrate:
		log.Info("running migrations")
		if err := database.Migrate(db); err != nil {
			return fmt.Errorf("migrate: %w", err)
		}
		log.Info("migrations complete")
	case cfg.DB.Reset:
		if !cfg.IsDev() {
			return fmt.Errorf("db reset is only allowed in development mode (ENV=development)")
		}
		log.Warn("resetting database — all data will be lost")
		if err := database.Reset(db, cfg); err != nil {
			return fmt.Errorf("reset: %w", err)
		}
		log.Info("database reset complete")
	default:
		log.Info("no db subcommand specified — use --migrate or --reset")
	}

	return nil
}

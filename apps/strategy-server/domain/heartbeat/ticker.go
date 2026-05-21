package heartbeat

import (
	"context"
	"log/slog"
	"time"
)

// DefaultInterval is the heartbeat evaluation interval when HEARTBEAT_INTERVAL
// is not configured.
const DefaultInterval = 5 * time.Minute

// RunTicker starts a blocking ticker loop that calls EvaluateAll on every tick.
// It returns when ctx is cancelled. This is intended to be started in a goroutine.
//
//	go heartbeatSvc.RunTicker(ctx, cfg.HeartbeatInterval)
//
// Failures in EvaluateAll are logged and the loop continues; individual
// instance errors inside EvaluateAll already degrade gracefully.
func (s *Service) RunTicker(ctx context.Context, interval time.Duration) {
	if interval <= 0 {
		interval = DefaultInterval
	}

	slog.InfoContext(ctx, "heartbeat: ticker started", "interval", interval)

	// Run once immediately so operators see signals without waiting a full interval.
	s.runOnce(ctx)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.InfoContext(ctx, "heartbeat: ticker stopped")
			return
		case <-ticker.C:
			s.runOnce(ctx)
		}
	}
}

func (s *Service) runOnce(ctx context.Context) {
	results, err := s.EvaluateAll(ctx)
	if err != nil {
		slog.ErrorContext(ctx, "heartbeat: EvaluateAll failed", "err", err)
		return
	}
	if len(results) > 0 {
		slog.InfoContext(ctx, "heartbeat: new signals persisted", "count", len(results))
	}
}

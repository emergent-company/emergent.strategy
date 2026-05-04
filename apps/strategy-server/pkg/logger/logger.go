// Package logger provides a context-aware slog wrapper for strategy-server.
package logger

import (
	"context"
	"log/slog"
	"os"
	"strings"
)

type contextKey struct{}

// New creates a new slog.Logger configured for the given log level.
// Output is JSON to stderr in all environments (structured logging).
func New(level string) *slog.Logger {
	var l slog.Level
	switch strings.ToUpper(level) {
	case "DEBUG":
		l = slog.LevelDebug
	case "WARN":
		l = slog.LevelWarn
	case "ERROR":
		l = slog.LevelError
	default:
		l = slog.LevelInfo
	}

	h := slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{Level: l})
	return slog.New(h)
}

// WithContext returns a new context that carries the given logger.
func WithContext(ctx context.Context, log *slog.Logger) context.Context {
	return context.WithValue(ctx, contextKey{}, log)
}

// FromContext returns the logger stored in ctx, or the default logger.
func FromContext(ctx context.Context) *slog.Logger {
	if log, ok := ctx.Value(contextKey{}).(*slog.Logger); ok && log != nil {
		return log
	}
	return slog.Default()
}

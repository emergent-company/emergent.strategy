package logger

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"go.uber.org/fx"
)

const (
	mainLogFile  = "server.log"
	errorLogFile = "server.error.log"
	debugLogFile = "server.debug.log"
	httpLogFile  = "server.http.log"
)

// getLogDir returns the log directory path, using WORKSPACE_ROOT if set
func getLogDir() string {
	// Check for WORKSPACE_ROOT env var (set by workspace-cli)
	if root := os.Getenv("WORKSPACE_ROOT"); root != "" {
		return filepath.Join(root, "logs", "server")
	}
	// Fall back to relative path from current working directory
	// Go up from apps/server-go to workspace root
	return filepath.Join("..", "..", "logs", "server")
}

var Module = fx.Module("logger",
	fx.Provide(NewLogger),
	fx.Provide(NewHTTPLogger),
)

// logFiles holds references to open log files for cleanup
type logFiles struct {
	main  *os.File
	error *os.File
	debug *os.File
}

var (
	openFiles *logFiles
	filesMu   sync.Mutex
)

// ensureLogDir creates the log directory if it doesn't exist
func ensureLogDir() error {
	return os.MkdirAll(getLogDir(), 0755)
}

// openLogFile opens a log file for appending, creating if necessary
func openLogFile(filename string) (*os.File, error) {
	path := filepath.Join(getLogDir(), filename)
	return os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0644)
}

// customHandler implements slog.Handler with NestJS-compatible formatting
// Format: 2026-01-16T21:47:08.511Z [LEVEL] [Scope] file.go:123 - message
type customHandler struct {
	level     slog.Level
	addSource bool
	writers   []io.Writer
	attrs     []slog.Attr
	groups    []string
	mu        *sync.Mutex
}

func newCustomHandler(level slog.Level, addSource bool, writers ...io.Writer) *customHandler {
	return &customHandler{
		level:     level,
		addSource: addSource,
		writers:   writers,
		mu:        &sync.Mutex{},
	}
}

func (h *customHandler) Enabled(_ context.Context, level slog.Level) bool {
	return level >= h.level
}

func (h *customHandler) Handle(_ context.Context, r slog.Record) error {
	// Format: 2026-01-16T21:47:08.511Z [LEVEL] [Scope] file.go:123 - message
	var buf strings.Builder

	// Timestamp in ISO 8601 format
	buf.WriteString(r.Time.UTC().Format("2006-01-02T15:04:05.000Z"))
	buf.WriteString(" ")

	// Level
	levelStr := strings.ToUpper(r.Level.String())
	buf.WriteString("[")
	buf.WriteString(levelStr)
	buf.WriteString("] ")

	// Extract scope from attributes
	scope := ""
	var otherAttrs []slog.Attr
	r.Attrs(func(a slog.Attr) bool {
		if a.Key == "scope" {
			scope = a.Value.String()
		} else {
			otherAttrs = append(otherAttrs, a)
		}
		return true
	})

	// Add inherited attrs
	for _, a := range h.attrs {
		if a.Key == "scope" && scope == "" {
			scope = a.Value.String()
		} else {
			otherAttrs = append(otherAttrs, a)
		}
	}

	// Scope (if present)
	if scope != "" {
		buf.WriteString("[")
		buf.WriteString(scope)
		buf.WriteString("] ")
	}

	// Source location (if enabled)
	if h.addSource && r.PC != 0 {
		fs := runtime.CallersFrames([]uintptr{r.PC})
		f, _ := fs.Next()
		if f.File != "" {
			// Extract just the filename
			_, filename := filepath.Split(f.File)
			buf.WriteString(filename)
			buf.WriteString(":")
			buf.WriteString(fmt.Sprintf("%d", f.Line))
			buf.WriteString(" ")
		}
	}

	// Message
	buf.WriteString("- ")
	buf.WriteString(r.Message)

	// Additional attributes (excluding scope)
	if len(otherAttrs) > 0 {
		for _, a := range otherAttrs {
			buf.WriteString(" ")
			buf.WriteString(a.Key)
			buf.WriteString("=")
			buf.WriteString(fmt.Sprintf("%v", a.Value.Any()))
		}
	}

	buf.WriteString("\n")

	// Write to all writers
	h.mu.Lock()
	defer h.mu.Unlock()
	for _, w := range h.writers {
		w.Write([]byte(buf.String()))
	}

	return nil
}

func (h *customHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	newAttrs := make([]slog.Attr, len(h.attrs)+len(attrs))
	copy(newAttrs, h.attrs)
	copy(newAttrs[len(h.attrs):], attrs)
	return &customHandler{
		level:     h.level,
		addSource: h.addSource,
		writers:   h.writers,
		attrs:     newAttrs,
		groups:    h.groups,
		mu:        h.mu,
	}
}

func (h *customHandler) WithGroup(name string) slog.Handler {
	newGroups := make([]string, len(h.groups)+1)
	copy(newGroups, h.groups)
	newGroups[len(h.groups)] = name
	return &customHandler{
		level:     h.level,
		addSource: h.addSource,
		writers:   h.writers,
		attrs:     h.attrs,
		groups:    newGroups,
		mu:        h.mu,
	}
}

// errorFilterHandler wraps a handler and only passes ERROR+ level logs
type errorFilterHandler struct {
	inner slog.Handler
}

func (h *errorFilterHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return level >= slog.LevelError && h.inner.Enabled(ctx, level)
}

func (h *errorFilterHandler) Handle(ctx context.Context, r slog.Record) error {
	return h.inner.Handle(ctx, r)
}

func (h *errorFilterHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &errorFilterHandler{inner: h.inner.WithAttrs(attrs)}
}

func (h *errorFilterHandler) WithGroup(name string) slog.Handler {
	return &errorFilterHandler{inner: h.inner.WithGroup(name)}
}

// multiHandler sends logs to multiple handlers
type multiHandler struct {
	handlers []slog.Handler
}

func (h *multiHandler) Enabled(ctx context.Context, level slog.Level) bool {
	for _, handler := range h.handlers {
		if handler.Enabled(ctx, level) {
			return true
		}
	}
	return false
}

func (h *multiHandler) Handle(ctx context.Context, r slog.Record) error {
	for _, handler := range h.handlers {
		if handler.Enabled(ctx, r.Level) {
			if err := handler.Handle(ctx, r); err != nil {
				return err
			}
		}
	}
	return nil
}

func (h *multiHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	handlers := make([]slog.Handler, len(h.handlers))
	for i, handler := range h.handlers {
		handlers[i] = handler.WithAttrs(attrs)
	}
	return &multiHandler{handlers: handlers}
}

func (h *multiHandler) WithGroup(name string) slog.Handler {
	handlers := make([]slog.Handler, len(h.handlers))
	for i, handler := range h.handlers {
		handlers[i] = handler.WithGroup(name)
	}
	return &multiHandler{handlers: handlers}
}

// NewLogger creates a structured logger based on environment
// Logs are written to stdout and to files in logs/server/
func NewLogger() *slog.Logger {
	level := slog.LevelInfo
	isDebug := false

	// Check LOG_LEVEL env var
	if lvl := os.Getenv("LOG_LEVEL"); lvl != "" {
		switch strings.ToLower(lvl) {
		case "debug":
			level = slog.LevelDebug
			isDebug = true
		case "info":
			level = slog.LevelInfo
		case "warn", "warning":
			level = slog.LevelWarn
		case "error":
			level = slog.LevelError
		}
	}

	// Create log directory
	if err := ensureLogDir(); err != nil {
		// Fall back to stdout-only if we can't create log dir
		fmt.Fprintf(os.Stderr, "Warning: could not create log directory: %v\n", err)
		return createStdoutOnlyLogger(level, isDebug)
	}

	var handlers []slog.Handler

	// 1. Stdout handler (always present)
	stdoutHandler := newCustomHandler(level, isDebug, os.Stdout)
	handlers = append(handlers, stdoutHandler)

	filesMu.Lock()
	defer filesMu.Unlock()

	openFiles = &logFiles{}

	// 2. Main log file - uses the configured level (not fixed to INFO)
	// This ensures LOG_LEVEL applies to all outputs
	if mainFile, err := openLogFile(mainLogFile); err == nil {
		openFiles.main = mainFile
		mainHandler := newCustomHandler(level, true, mainFile)
		handlers = append(handlers, mainHandler)
	}

	// 3. Error log file (ERROR+) - always captures errors regardless of level
	if errorFile, err := openLogFile(errorLogFile); err == nil {
		openFiles.error = errorFile
		errorHandler := newCustomHandler(slog.LevelError, true, errorFile)
		handlers = append(handlers, &errorFilterHandler{inner: errorHandler})
	}

	// 4. Debug log file (DEBUG+, only if debug level is enabled)
	if isDebug {
		if debugFile, err := openLogFile(debugLogFile); err == nil {
			openFiles.debug = debugFile
			debugHandler := newCustomHandler(slog.LevelDebug, true, debugFile)
			handlers = append(handlers, debugHandler)
		}
	}

	// Combine all handlers
	logger := slog.New(&multiHandler{handlers: handlers})
	slog.SetDefault(logger)

	return logger
}

func createStdoutOnlyLogger(level slog.Level, addSource bool) *slog.Logger {
	handler := newCustomHandler(level, addSource, os.Stdout)
	logger := slog.New(handler)
	slog.SetDefault(logger)
	return logger
}

// HTTPLogger is a specialized logger for HTTP request/response logging
type HTTPLogger struct {
	file   *os.File
	mu     sync.Mutex
	logger *slog.Logger
}

// NewHTTPLogger creates a logger specifically for HTTP requests
func NewHTTPLogger(logger *slog.Logger) *HTTPLogger {
	httpLogger := &HTTPLogger{logger: logger}

	if err := ensureLogDir(); err != nil {
		logger.Warn("Could not create log directory for HTTP logs", "error", err)
		return httpLogger
	}

	if file, err := openLogFile(httpLogFile); err == nil {
		httpLogger.file = file
	} else {
		logger.Warn("Could not open HTTP log file", "error", err)
	}

	return httpLogger
}

// LogRequest logs an HTTP request in the standard format
// Format: 2026-01-16T18:51:46.401Z IP METHOD /path STATUS DURATIONms "User-Agent" [req-id]
func (h *HTTPLogger) LogRequest(ip, method, path string, status int, duration time.Duration, userAgent, requestID string) {
	// Format timestamp
	timestamp := time.Now().UTC().Format("2006-01-02T15:04:05.000Z")

	// Format duration in milliseconds
	durationMs := duration.Milliseconds()

	// Build log line
	logLine := fmt.Sprintf("%s %s %s %s %d %dms \"%s\" [%s]\n",
		timestamp, ip, method, path, status, durationMs, userAgent, requestID)

	// Write to file if available
	if h.file != nil {
		h.mu.Lock()
		h.file.WriteString(logLine)
		h.mu.Unlock()
	}
}

// Close closes all open log files
func CloseLogFiles() {
	filesMu.Lock()
	defer filesMu.Unlock()

	if openFiles != nil {
		if openFiles.main != nil {
			openFiles.main.Close()
		}
		if openFiles.error != nil {
			openFiles.error.Close()
		}
		if openFiles.debug != nil {
			openFiles.debug.Close()
		}
	}
}

// Scope creates a child logger with a scope attribute
func Scope(scope string) slog.Attr {
	return slog.String("scope", scope)
}

// Error wraps an error as a slog attribute
func Error(err error) slog.Attr {
	return slog.Any("error", err)
}

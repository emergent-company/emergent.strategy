// Package version provides a single source of truth for epf-cli version info.
// All version variables are injected via ldflags at build time.
// Both cmd and internal/mcp import from this package to avoid duplication.
package version

// These variables are set at build time via -ldflags.
// When built without ldflags (bare `go build`), they retain their zero values
// which signals a development build.
var (
	Version   = "dev"
	GitCommit = "dev"
	BuildDate = "unknown"
)

// Command gen-integrity-manifest writes integrity-manifest.json for a canonical
// EPF checkout: the normalised hash of every template, definition, value model
// and AIM template at every release commit.
//
// Usage: go run ./scripts/gen-integrity-manifest -canonical <dir> [-out <file>]
package main

import (
	"flag"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/integrity"
)

func main() {
	canonical := flag.String("canonical", "", "path to the canonical EPF git checkout (required)")
	out := flag.String("out", "", "output file (default: <canonical>/integrity-manifest.json)")
	flag.Parse()

	if *canonical == "" {
		fmt.Fprintln(os.Stderr, "error: -canonical is required")
		os.Exit(2)
	}
	if *out == "" {
		*out = filepath.Join(*canonical, "integrity-manifest.json")
	}
	if err := run(*canonical, *out); err != nil {
		slog.Error("generate manifest failed", "err", err)
		os.Exit(1)
	}
}

func run(canonical, out string) error {
	src, err := integrity.NewGitSource(canonical)
	if err != nil {
		return fmt.Errorf("open canonical checkout: %w", err)
	}
	m, err := integrity.BuildManifest(src)
	if err != nil {
		return fmt.Errorf("build manifest: %w", err)
	}
	data, err := m.MarshalJSON()
	if err != nil {
		return fmt.Errorf("render manifest: %w", err)
	}
	if err := os.WriteFile(out, data, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", out, err)
	}
	slog.Info("manifest written",
		"file", out,
		"releases", len(m.Releases),
		"current", m.CurrentRelease,
		"distinct_documents", len(m.Entries),
		"skipped", len(m.Skipped))
	return nil
}

package main

import (
	"bufio"
	"os"
	"strings"
)

// loadEnvLocal reads .env.local (if present) and sets environment variables
// for any key not already set. This ensures dev config is picked up without
// requiring `source .env.local` in the shell, while still allowing real
// environment variables to take precedence.
//
// The parser handles:
//   - KEY=VALUE lines
//   - Blank lines and # comments (skipped)
//   - Optional quoting: KEY="value" or KEY='value' (quotes stripped)
//   - export KEY=VALUE prefix (export keyword stripped)
//
// It does NOT handle multi-line values, variable interpolation, or escapes.
func loadEnvLocal() {
	f, err := os.Open(".env.local")
	if err != nil {
		return // file doesn't exist — nothing to do
	}
	defer func() { _ = f.Close() }()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// Skip blanks and comments.
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Strip optional "export " prefix.
		line = strings.TrimPrefix(line, "export ")

		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)

		// Strip surrounding quotes.
		if len(value) >= 2 {
			if (value[0] == '"' && value[len(value)-1] == '"') ||
				(value[0] == '\'' && value[len(value)-1] == '\'') {
				value = value[1 : len(value)-1]
			}
		}

		// Only set if not already present — real env takes precedence.
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, value)
		}
	}
}

// Command genselfmodel regenerates the committed self-model file.
//
// Mirrors 21st-bot's tools/genmanifest precedent (design.md's adoption
// checklist item 3/5): `-out` writes the freshly generated self-model;
// `-check` reports drift (exit 1) without writing, for use in `task check`.
// The actual drift assertion also exists as a Go test
// (internal/selfmodel.TestModel_CommittedFileMatchesGenerated) — this
// binary exists for the regeneration half (`-out`) that a test cannot do,
// and duplicates `-check` only so `task selfmodel:check` has a
// single-purpose, non-test command to run in CI-equivalent scripts.
package main

import (
	"bytes"
	"flag"
	"fmt"
	"os"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/selfmodel"
)

func main() {
	out := flag.String("out", "", "path to write the generated self-model JSON")
	check := flag.String("check", "", "path to an existing self-model JSON; exits 1 if it differs from freshly generated output")
	flag.Parse()

	if (*out == "") == (*check == "") {
		fmt.Fprintln(os.Stderr, "genselfmodel: exactly one of -out or -check is required")
		os.Exit(2)
	}

	model, err := selfmodel.Generate()
	if err != nil {
		fmt.Fprintf(os.Stderr, "genselfmodel: generate: %v\n", err)
		os.Exit(1)
	}
	fresh, err := selfmodel.MarshalIndent(model)
	if err != nil {
		fmt.Fprintf(os.Stderr, "genselfmodel: marshal: %v\n", err)
		os.Exit(1)
	}

	if *out != "" {
		if err := os.WriteFile(*out, fresh, 0o644); err != nil {
			fmt.Fprintf(os.Stderr, "genselfmodel: write %s: %v\n", *out, err)
			os.Exit(1)
		}
		fmt.Printf("genselfmodel: wrote %s (%d tools, %d categories, %d phases, %d screens)\n",
			*out, len(model.Tools), len(model.Categories), len(model.Phases), len(model.Screens))
		return
	}

	committed, err := os.ReadFile(*check)
	if err != nil {
		fmt.Fprintf(os.Stderr, "genselfmodel: read %s: %v\n", *check, err)
		os.Exit(1)
	}
	if !bytes.Equal(committed, fresh) {
		fmt.Fprintf(os.Stderr, "genselfmodel: %s is stale — run with -out %s and commit the result\n", *check, *check)
		os.Exit(1)
	}
	fmt.Printf("genselfmodel: %s is up to date\n", *check)
}

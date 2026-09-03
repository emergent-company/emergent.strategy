package llm_test

// Live Bedrock smoke test — the thing this file exists for is answering one
// question with certainty: does Claude on Bedrock actually work from your AWS
// environment, with your credentials, against a real endpoint? Every other
// Bedrock test in this package (bedrock_test.go) runs against a fake invoker
// and has never made a real network call — this is deliberately the one that
// does.
//
// It needs nothing from this project's stack: no Postgres, no Memory server,
// no migrations, no strategy-server binary. Only the AWS SDK's default
// credential chain (environment variables, ~/.aws/credentials, an assumed
// role, or an instance/IRSA role) and two environment variables naming the
// region and model to call.
//
// Run it like this:
//
//	export LLM_BEDROCK_LIVE_TEST=1
//	export LLM_BEDROCK_REGION=eu-central-1
//	export LLM_MODEL=eu.anthropic.claude-3-5-sonnet-20241022-v2:0
//	go test ./internal/llm/ -run TestBedrock_Live -v
//
// Skipped by default — this never runs in CI, and never runs as part of a
// normal `go test ./...`, so it costs nothing and calls no external API
// unless explicitly asked for.
//
// If this fails, the error message classification (see bedrock.go's error
// mapping, exercised for real here rather than against synthetic AWS errors)
// tells you which of the two most common causes it is:
//   - AccessDenied — either the AWS principal lacks bedrock:InvokeModel on
//     this model's ARN, or the model is not enabled for this account in the
//     Bedrock console under Model access. Both surface identically; check
//     both.
//   - a credential-resolution failure — the request never reached AWS. Check
//     which credential source you expect to be active (env vars, profile,
//     instance role) and that it is actually present in this shell/process.
//
// See AGENTS.md's "LLM Provider Auth" section for the full reference.

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/llm"
)

func TestBedrock_LiveSmokeTest(t *testing.T) {
	if os.Getenv("LLM_BEDROCK_LIVE_TEST") == "" {
		t.Skip("set LLM_BEDROCK_LIVE_TEST=1 to run a real call against AWS Bedrock (see this file's doc comment)")
	}

	region := os.Getenv("LLM_BEDROCK_REGION")
	if region == "" {
		t.Fatal("LLM_BEDROCK_REGION is required (e.g. eu-central-1)")
	}
	model := os.Getenv("LLM_MODEL")
	if model == "" {
		t.Fatal("LLM_MODEL is required (e.g. eu.anthropic.claude-3-5-sonnet-20241022-v2:0)")
	}

	t.Logf("connecting to Bedrock: region=%s model=%s", region, model)

	ctx, cancel := context.WithTimeout(t.Context(), 30*time.Second)
	defer cancel()

	provider, err := llm.NewBedrock(ctx, llm.Config{
		BedrockRegion: region,
		Model:         model,
	})
	if err != nil {
		t.Fatalf("construct provider: %v", err)
	}

	// Ping first: cheap (minimal tokens), and isolates "can we reach Bedrock
	// and are we entitled to this model" from "does a real generation work",
	// which is exactly the split cmd_serve.go's own boot-time preflight makes
	// — see setupLLM.
	if err := provider.Ping(ctx); err != nil {
		if llm.IsAccessDenied(err) {
			t.Fatalf("Ping: ACCESS DENIED — either bedrock:InvokeModel is missing on this "+
				"principal for this model's ARN, or the model is not enabled for this account "+
				"in the Bedrock console under Model access (both surface identically): %v", err)
		}
		t.Fatalf("Ping failed (retryable=%v): %v", llm.IsRetryable(err), err)
	}
	t.Log("Ping OK — Bedrock is reachable and this principal is entitled to the model")

	// A real generation, not just connectivity — confirms the Anthropic
	// Messages wire translation (bedrock.go) round-trips correctly against
	// the actual API, not just against the fake invoker every other test in
	// this package uses.
	result, err := provider.Chat(ctx, []llm.ChatMessage{
		{Role: "user", Content: `Reply with exactly one word: "pong".`},
	}, 0)
	if err != nil {
		t.Fatalf("Chat failed: %v", err)
	}
	if result.Content == "" {
		t.Fatal("Chat returned an empty response")
	}
	t.Logf("Chat OK — model replied: %q", result.Content)
	t.Logf("tokens: input=%d output=%d", result.InputTokens, result.OutputTokens)
}

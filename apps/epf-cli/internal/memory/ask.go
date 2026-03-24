package memory

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"sync"
	"time"
)

// AskResult holds the response from graph-powered question answering.
type AskResult struct {
	Response  string   `json:"response"`
	Tools     []string `json:"tools"`
	SessionID string   `json:"session_id,omitempty"`
	ElapsedMs int64    `json:"elapsedMs,omitempty"`
}

// AskPreflightResult contains the result of checking whether Ask
// prerequisites are met. Call CheckAskPreflight once at startup.
type AskPreflightResult struct {
	Available   bool   `json:"available"`
	MemoryBin   string `json:"memory_bin,omitempty"`
	Error       string `json:"error,omitempty"`
	InstallHint string `json:"install_hint,omitempty"`
}

var (
	askPreflight     *AskPreflightResult
	askPreflightOnce sync.Once
)

// CheckAskPreflight verifies that the memory CLI is installed and
// returns a cached result. Safe to call from multiple goroutines.
// This is a fast, deterministic check (no network calls).
func CheckAskPreflight() *AskPreflightResult {
	askPreflightOnce.Do(func() {
		askPreflight = doAskPreflight()
	})
	return askPreflight
}

func doAskPreflight() *AskPreflightResult {
	bin, err := exec.LookPath("memory")
	if err != nil {
		return &AskPreflightResult{
			Available: false,
			Error:     "'memory' CLI not found on PATH",
			InstallHint: "Install with: curl -fsSL https://memory.emergent-company.ai/install | sh\n" +
				"Then run: memory login",
		}
	}

	// Verify the binary is executable by checking version (fast, no network)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, "version")
	if err := cmd.Run(); err != nil {
		return &AskPreflightResult{
			Available:   false,
			MemoryBin:   bin,
			Error:       fmt.Sprintf("'memory' binary found at %s but failed to run: %v", bin, err),
			InstallHint: "Try reinstalling: curl -fsSL https://memory.emergent-company.ai/install | sh",
		}
	}

	return &AskPreflightResult{
		Available: true,
		MemoryBin: bin,
	}
}

// Ask queries the strategy graph to answer a natural language question.
//
// This delegates to the Memory CLI's `memory query` command, which uses
// the server-side graph-query-agent with access to graph traversal tools
// (entity-query, entity-edges-get, search-hybrid).
//
// The Memory CLI handles auth internally — it works with project tokens
// passed via --project-token, no OAuth session required.
//
// Prerequisites (checked by CheckAskPreflight):
//   - memory CLI on PATH
//   - EPF_MEMORY_URL, EPF_MEMORY_PROJECT, EPF_MEMORY_TOKEN env vars set
//
// See: https://github.com/emergent-company/emergent-strategy/issues/23
func (c *Client) Ask(ctx context.Context, question string) (*AskResult, error) {
	preflight := CheckAskPreflight()
	if !preflight.Available {
		return nil, fmt.Errorf("%s\n\n%s", preflight.Error, preflight.InstallHint)
	}

	args := []string{
		"query", question,
		"--project-token", c.token,
		"--project", c.projectID,
		"--server", c.baseURL,
		"--json",
	}

	cmd := exec.CommandContext(ctx, preflight.MemoryBin, args...)
	output, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			stderr := string(exitErr.Stderr)
			// Filter out ANSI escape codes and login prompts
			if containsLoginPrompt(stderr) {
				return nil, fmt.Errorf("memory query authentication failed.\n\n" +
					"The project token may be invalid or expired.\n" +
					"Regenerate with: memory projects create-token <project-name>")
			}
			return nil, fmt.Errorf("memory query failed: %s", stderr)
		}
		return nil, fmt.Errorf("memory query failed: %w", err)
	}

	var result AskResult
	if err := json.Unmarshal(output, &result); err != nil {
		// If JSON parsing fails, return the raw output as the response
		return &AskResult{
			Response: string(output),
		}, nil
	}

	return &result, nil
}

// containsLoginPrompt detects if stderr contains a login/auth prompt
// which would indicate the token is invalid.
func containsLoginPrompt(s string) bool {
	for _, pattern := range []string{
		"session has expired",
		"not authenticated",
		"Run the following command to log in",
	} {
		for i := 0; i <= len(s)-len(pattern); i++ {
			if s[i:i+len(pattern)] == pattern {
				return true
			}
		}
	}
	return false
}

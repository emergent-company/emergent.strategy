package memory

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
)

// AskResult holds the response from graph-powered question answering.
type AskResult struct {
	Response  string   `json:"response"`
	Tools     []string `json:"tools"`
	SessionID string   `json:"session_id,omitempty"`
	ElapsedMs int64    `json:"elapsedMs,omitempty"`
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
// See: https://github.com/emergent-company/emergent-strategy/issues/23
func (c *Client) Ask(ctx context.Context, question string) (*AskResult, error) {
	memoryBin, err := exec.LookPath("memory")
	if err != nil {
		return nil, fmt.Errorf("the 'memory' CLI is required but not found on PATH.\n\n" +
			"Install it with: curl -fsSL https://memory.emergent-company.ai/install | sh\n" +
			"Or see: https://docs.memory.emergent-company.ai/getting-started")
	}

	args := []string{
		"query", question,
		"--project-token", c.token,
		"--project", c.projectID,
		"--server", c.baseURL,
		"--json",
	}

	cmd := exec.CommandContext(ctx, memoryBin, args...)
	output, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return nil, fmt.Errorf("memory query failed: %s", string(exitErr.Stderr))
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

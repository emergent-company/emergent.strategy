package memory

import (
	"context"
	"fmt"
)

// AskResult holds the response from graph-powered question answering.
type AskResult struct {
	Response string   `json:"response"`
	Tools    []string `json:"tools"`
}

// Ask queries the strategy graph to answer a natural language question.
//
// This feature requires the Memory graph-query-agent to be accessible
// via project token auth, which is not yet available.
//
// Tracked in:
//   - emergent.memory#132 (API feature request)
//   - emergent.strategy#24 (integration tracking)
//
// See: https://github.com/emergent-company/emergent-strategy/issues/23
func (c *Client) Ask(ctx context.Context, question string) (*AskResult, error) {
	return nil, fmt.Errorf("the ask feature is not yet available.\n\n"+
		"It requires the Memory graph-query-agent to support project token\n"+
		"authentication, which has been requested (emergent.memory#132).\n\n"+
		"In the meantime, use the Memory CLI directly:\n"+
		"  memory query \"%s\"", question)
}

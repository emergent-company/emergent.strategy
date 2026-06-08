package score

import (
	"context"

	"github.com/emergent-company/emergent-strategy/apps/orchestrator/internal/mcp"
)

// liveCaller adapts an *mcp.Client plus its Discovery into a ToolCaller:
// tool availability comes from the Discovery (post-filter), tool invocation
// from the Client.
type liveCaller struct {
	client    *mcp.Client
	discovery mcp.Discovery
}

// NewLiveCaller builds a ToolCaller from a connected MCP client and the
// discovery result returned by Client.Connect.
func NewLiveCaller(client *mcp.Client, discovery mcp.Discovery) ToolCaller {
	return liveCaller{client: client, discovery: discovery}
}

func (l liveCaller) Has(name string) bool { return l.discovery.Has(name) }

func (l liveCaller) CallJSON(ctx context.Context, name string, args map[string]any, out any) error {
	return l.client.CallJSON(ctx, name, args, out)
}

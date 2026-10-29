package mcpserver

import (
	"github.com/mark3labs/mcp-go/mcp"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
)

// requestBudget is the response budget a caller asked for: max_chars if given,
// otherwise the hard cap when full is "true", otherwise zero for the default.
// The caller applies the cap with strategyread.NormaliseBudget.
func requestBudget(req mcp.CallToolRequest) int {
	if n := argInt(req, "max_chars", 0); n > 0 {
		return n
	}
	if argString(req, "full") == "true" {
		return strategyread.HardMaxChars
	}
	return 0
}

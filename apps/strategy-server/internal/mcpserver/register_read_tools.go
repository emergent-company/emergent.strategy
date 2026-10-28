package mcpserver

import (
	"context"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
)

// registerBoundedReadTools registers the question-sized reads: what an instance
// defines (get_outline), one section within a size budget (get_section), and
// answers that span artifacts (get_view). They are in the always-visible core
// category so a client sees them without a set_tool_filter call.
func registerBoundedReadTools(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("get_outline",
		mcp.WithDescription("USE FIRST to answer any question about what a company's strategy says. Returns which strategy documents this instance defines (north star, insights, foundations, formula, roadmap), each with its sections and their sizes, and which documents are not defined and why. Unmodified framework templates and definitions are counted, never listed as the company's strategy. Returns no content; read a section next with get_section."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("artifact", mcp.Description("Optional artifact key, e.g. strategy_formula. Describes that artifact's sections with a one-line gist each.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, id); err != nil {
			return toolErr(ctx, err), nil
		}
		out, err := svc.Strategy.ReadOutline(ctx, id, argString(req, "artifact"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(out)
	})

	s.AddTool(mcp.NewTool("get_section",
		mcp.WithDescription("USE WHEN you need what the strategy says about one thing. Returns the stored content of one section of one artifact, authoritative and within a size budget (default 12000 characters, cap 40000). Every response says whether the section is defined, where it came from, how big it is and whether it was cut; it never cuts silently. Cite it with cite_as. If it is not defined, say so; do not fill it in. Use get_outline to find artifact names and paths."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("artifact", mcp.Required(), mcp.Description("Artifact key, e.g. north_star, strategy_formula, roadmap_recipe, insight_analyses")),
		mcp.WithString("path", mcp.Description(`Section path, e.g. "mission.boundaries" or "tracks.commercial.okrs[id=okr-c-001]". Array items by position [2], by field [id=x] or [name=x]; the rest of a list from [3:]. Empty reads the whole artifact within the budget.`)),
		mcp.WithString("max_chars", mcp.Description("Response budget in characters (default 12000, cap 40000)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, id); err != nil {
			return toolErr(ctx, err), nil
		}
		out, err := svc.Strategy.ReadSection(ctx, id, argString(req, "artifact"), argString(req, "path"), argInt(req, "max_chars", 0))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(out)
	})

	s.AddTool(mcp.NewTool("get_view",
		mcp.WithDescription("USE WHEN a question needs more than one artifact. Views: competitor (name) - our positioning against one named competitor, from the strategy formula and the insights landscape; objectives (track optional) - objective and key result ids and text by track; key_result (id) - one key result with its objective, assumptions and dependencies; personas - the target users. Each part reports whether it is defined and its source; a part that is missing is reported, not skipped. Same budget and fields as get_section."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("view", mcp.Required(), mcp.Description("One of: "+viewList())),
		mcp.WithString("name", mcp.Description("Competitor name, for the competitor view")),
		mcp.WithString("id", mcp.Description("Key result id, for the key_result view, e.g. kr-c-001")),
		mcp.WithString("track", mcp.Description("Roadmap track, for the objectives view")),
		mcp.WithString("max_chars", mcp.Description("Shared response budget in characters (default 12000, cap 40000)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, id); err != nil {
			return toolErr(ctx, err), nil
		}
		args := map[string]string{}
		for _, k := range []string{"name", "id", "track"} {
			if v := argString(req, k); v != "" {
				args[k] = v
			}
		}
		out, err := svc.Strategy.ReadView(ctx, id, argString(req, "view"), args, argInt(req, "max_chars", 0))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(out)
	})
}

func viewList() string {
	out := ""
	for i, v := range strategy.ViewNames {
		if i > 0 {
			out += ", "
		}
		out += v
	}
	return out
}

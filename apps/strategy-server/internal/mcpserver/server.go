// Package mcpserver wires all strategy-server domain services to MCP tools.
//
// Tool inventory (96 tools + 1 prompt):
//
//	Workspace/Instance:  5 read + 4 write
//	Strategy context:    5 read
//	Artifact/Mutation:   6 read
//	Semantic:            7 (search, neighbors, contradictions, scenario lifecycle)
//	Embedded knowledge:  12 (schemas, templates, agents, skills, wizards, routing)
//	Agent runtime:       2 (pending batches, describe)
//	Mutation write:      4 core + 7 expanded + 2 batch
//	Derived reads:       6 (value paths, coverage, assumptions, dependencies)
//	Validation:          5 (artifact, instance, relationships, readiness, fix plan)
//	Export:              3
//	AIM lifecycle:       5 read/write + 2 phase 2c (validate_assumptions, stage_calibration)
//	Organisation:        5
//	Skill pack/app:      11
//	Phase 2c additions:  10 (phase artifacts, definitions, persona details,
//	                        relationships, scenario discard)
//
// All write tools create staged mutations; commit_batch promotes them.
package mcpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	appdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/app"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	orgdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/pack"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	schemadom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/schema"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	versiondom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/agent"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// IngestEnqueuer is the interface used to trigger async Memory graph ingestion
// after a batch is committed.
type IngestEnqueuer interface {
	EnqueueBatch(instanceID, batchID uuid.UUID)
}

// Services bundles all domain services used by the MCP server.
type Services struct {
	Workspace *workspace.Service
	Instance  *instance.Service
	Strategy  *strategy.Service
	Pack      *pack.Service
	App       *appdom.Service
	Semantic  *semantic.Service
	Org       *orgdom.Service
	Schema    *schemadom.Service    // optional — nil falls back to embedded-only validation
	Version   *versiondom.Service  // optional — nil disables versioning tools
	Ingest    IngestEnqueuer       // optional — nil when Memory is not configured
}

// New creates and registers all MCP tools, returning the StreamableHTTPServer
// that can be mounted at any path as an http.Handler.
func New(svc Services) http.Handler {
	s := server.NewMCPServer(
		"strategy-server",
		"1.0.0",
		server.WithToolCapabilities(true),
		server.WithPromptCapabilities(true),
		server.WithInstructions(agent.ServerInstructions()),
	)

	registerWorkspaceReadTools(s, svc)
	registerInstanceReadTools(s, svc)
	registerArtifactContextTools(s, svc)
	registerArtifactMutationTools(s, svc)
	registerSemanticReadTools(s, svc)
	registerEmbeddedKnowledgeTools(s)
	registerAgentRuntimeTools(s, svc)
	registerWorkspaceWriteTools(s, svc)
	registerMutationWriteTools(s, svc)
	registerExpandedWriteTools(s, svc)
	registerBatchWriteTools(s, svc)
	registerDerivedReadTools(s, svc)
	registerValidationTools(s, svc)
	registerExportTools(s, svc)
	registerAIMTools(s, svc)
	registerPackTools(s, svc)
	registerOrgTools(s, svc)
	registerPhase2cTools(s, svc)
	registerVersionTools(s, svc)
	registerKnowledgePrompt(s)

	return server.NewStreamableHTTPServer(s)
}

// registerKnowledgePrompt registers the strategy-server domain knowledge base
// as an MCP Prompt. Clients call get_prompt("strategy-server") at session start
// to orient themselves before using any other tools.
func registerKnowledgePrompt(s *server.MCPServer) {
	s.AddPrompt(
		mcp.NewPrompt(
			"strategy-server",
			mcp.WithPromptDescription("Domain orientation for strategy-server: data model, tool-use patterns, workflow guidance, and common mistakes to avoid. Call this at session start before using other tools."),
		),
		func(_ context.Context, _ mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
			return &mcp.GetPromptResult{
				Description: "strategy-server domain knowledge base",
				Messages: []mcp.PromptMessage{
					{
						Role:    mcp.RoleUser,
						Content: mcp.NewTextContent(agent.Format()),
					},
				},
			}, nil
		},
	)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func toolErr(ctx context.Context, err error) *mcp.CallToolResult {
	return mcp.NewToolResultError(apperror.LocalizeErr(ctx, err))
}

func argString(req mcp.CallToolRequest, key string) string {
	return req.GetString(key, "")
}

func argInt(req mcp.CallToolRequest, key string, def int) int {
	return req.GetInt(key, def)
}

func parseUUID(s string) (uuid.UUID, error) {
	id, err := uuid.Parse(s)
	if err != nil {
		return uuid.Nil, apperror.ErrBadRequest.WithDetail(fmt.Sprintf("invalid UUID %q: %v", s, err))
	}
	return id, nil
}

// ---------------------------------------------------------------------------
// Read tools — workspace + instance
// ---------------------------------------------------------------------------

func registerWorkspaceReadTools(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("list_workspaces",
		mcp.WithDescription("USE WHEN you need to enumerate all accessible workspaces."),
		mcp.WithString("cursor", mcp.Description("Pagination cursor from previous response")),
		mcp.WithString("limit", mcp.Description("Max results per page (1–200)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		result, err := svc.Workspace.ListWorkspaces(ctx, workspace.ListParams{
			Cursor: argString(req, "cursor"),
			Limit:  argInt(req, "limit", 50),
		})
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(result)
	})

	s.AddTool(mcp.NewTool("get_workspace",
		mcp.WithDescription("USE WHEN you need details for a specific workspace by ID."),
		mcp.WithString("workspace_id", mcp.Required(), mcp.Description("Workspace UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "workspace_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		ws, err := svc.Workspace.GetWorkspace(ctx, id)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(ws)
	})
}

func registerInstanceReadTools(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("list_instances",
		mcp.WithDescription("USE WHEN you need to list strategy instances in a workspace."),
		mcp.WithString("workspace_id", mcp.Required(), mcp.Description("Workspace UUID")),
		mcp.WithString("cursor", mcp.Description("Pagination cursor")),
		mcp.WithString("limit", mcp.Description("Max results")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		wsID, err := parseUUID(argString(req, "workspace_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		result, err := svc.Instance.ListInstances(ctx, instance.ListParams{
			WorkspaceID: wsID,
			Cursor:      argString(req, "cursor"),
			Limit:       argInt(req, "limit", 50),
		})
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(result)
	})

	s.AddTool(mcp.NewTool("get_instance",
		mcp.WithDescription("USE WHEN you need details and health status for a specific instance."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		inst, err := svc.Instance.GetInstance(ctx, id)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(inst)
	})

	s.AddTool(mcp.NewTool("health_check",
		mcp.WithDescription("USE WHEN you need a health report and artifact completeness summary for an instance."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		inst, err := svc.Instance.GetInstance(ctx, id)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		artifacts, err := svc.Strategy.ListCurrentArtifacts(ctx, id, "")
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// Standard pack status: report current version and whether it is up to date.
		serverVersion := strings.TrimSpace(embedded.Version)
		standardPackStatus := map[string]any{
			"server_version": serverVersion,
			"installed":      false,
		}
		if svc.Pack != nil {
			packs, packErr := svc.Pack.ListInstalledPacks(ctx, id)
			if packErr == nil {
				for _, p := range packs {
					if p.PackName == pack.StandardPackName {
						standardPackStatus["installed"] = true
						standardPackStatus["installed_version"] = p.PackVersion
						standardPackStatus["up_to_date"] = p.PackVersion == serverVersion
						break
					}
				}
			}
		}

		// Schema registry status.
		schemaStatus := map[string]any{
			"schema_version": inst.SchemaVersion,
			"dialect":        inst.Dialect,
		}
		if svc.Schema != nil {
			schemaStatus["registry_available"] = true
			if latest, ok, schErr := svc.Schema.LatestVersion(ctx); schErr == nil && ok {
				schemaStatus["registry_latest_version"] = latest
			}
		} else {
			schemaStatus["registry_available"] = false
		}

		return mustJSON(map[string]any{
			"instance":             inst,
			"artifact_count":       len(artifacts),
			"status":               inst.Status,
			"standard_pack_status": standardPackStatus,
			"schema_status":        schemaStatus,
		})
	})
}

// ---------------------------------------------------------------------------
// Read tools — strategy artifacts (context views)
// ---------------------------------------------------------------------------

func registerArtifactContextTools(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("get_strategy_context",
		mcp.WithDescription("USE WHEN you need full strategic context: vision, personas, and competitive position."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		artifacts, err := svc.Strategy.ListCurrentArtifacts(ctx, id, "")
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(artifacts)
	})

	s.AddTool(mcp.NewTool("get_product_vision",
		mcp.WithDescription("USE WHEN you need the north star vision for a strategy instance."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		raw, err := svc.Strategy.GetCurrentArtifact(ctx, id, "north_star")
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mcp.NewToolResultText(string(raw)), nil
	})

	s.AddTool(mcp.NewTool("get_personas",
		mcp.WithDescription("USE WHEN you need target personas and their pain points for a strategy instance."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		raw, err := svc.Strategy.GetCurrentArtifact(ctx, id, "strategy_foundations")
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mcp.NewToolResultText(string(raw)), nil
	})

	s.AddTool(mcp.NewTool("get_competitive_position",
		mcp.WithDescription("USE WHEN you need the competitive analysis for a strategy instance."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		raw, err := svc.Strategy.GetCurrentArtifact(ctx, id, "insight_analyses")
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mcp.NewToolResultText(string(raw)), nil
	})

	s.AddTool(mcp.NewTool("get_roadmap",
		mcp.WithDescription("USE WHEN you need the full roadmap recipe for a strategy instance."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		raw, err := svc.Strategy.GetCurrentArtifact(ctx, id, "roadmap_recipe")
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mcp.NewToolResultText(string(raw)), nil
	})

}

// registerArtifactMutationTools registers feature and mutation read tools.
func registerArtifactMutationTools(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("list_features",
		mcp.WithDescription("USE WHEN you need the feature list with strategic alignment for an instance."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("include_archived", mcp.Description(`Set to "true" to include archived features in the response (default: false).`)),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		includeArchived := argString(req, "include_archived") == "true"
		features, err := svc.Strategy.ListArtifactsFiltered(ctx, id, "feature", includeArchived)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(features)
	})

	s.AddTool(mcp.NewTool("get_feature",
		mcp.WithDescription("USE WHEN you need full details and value model for a single feature."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("feature_key", mcp.Required(), mcp.Description("Feature artifact key, e.g. fd-001")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		raw, err := svc.Strategy.GetCurrentArtifact(ctx, id, argString(req, "feature_key"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mcp.NewToolResultText(string(raw)), nil
	})

	s.AddTool(mcp.NewTool("list_artifacts",
		mcp.WithDescription("USE WHEN you need to list strategy artifacts of any type (commercial_def, org_ops_def, strategy_def, value_model, etc.) with their index fields (name, track, status)."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("artifact_type", mcp.Description("Filter by artifact type, e.g. commercial_def, org_ops_def, strategy_def, value_model, feature")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		artifacts, err := svc.Strategy.ListCurrentArtifacts(ctx, id, argString(req, "artifact_type"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(artifacts)
	})

	s.AddTool(mcp.NewTool("list_relationships",
		mcp.WithDescription("USE WHEN you need all cross-artifact relationships (contributes_to, depends_on, tests_assumption, etc.) for a specific artifact key."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("artifact_key", mcp.Required(), mcp.Description("Artifact key to query relationships for, e.g. fd-001 or FIRE/definitions/commercial/financing/cd-010-investor-pitch-decks")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		rels, err := svc.Strategy.ListRelationships(ctx, id, argString(req, "artifact_key"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(rels)
	})

	s.AddTool(mcp.NewTool("list_mutations",
		mcp.WithDescription("USE WHEN you need the change history for a strategy instance."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("artifact_type", mcp.Description("Filter by artifact type, e.g. feature")),
		mcp.WithString("include_staged", mcp.Description("true to include staged (uncommitted) mutations")),
		mcp.WithString("limit", mcp.Description("Max results per page (1–200, default 50)")),
		mcp.WithString("cursor", mcp.Description("Pagination cursor (mutation ID) from a previous response")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		includeStaged := argString(req, "include_staged") == "true"
		limit := req.GetInt("limit", 50)
		cursor := argString(req, "cursor")
		sinceMutationID := argString(req, "since_mutation_id")
		mutations, nextCursor, err := svc.Strategy.ListMutations(ctx, id, argString(req, "artifact_type"), includeStaged, limit, cursor, sinceMutationID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{"mutations": mutations, "next_cursor": nextCursor})
	})

	s.AddTool(mcp.NewTool("get_mutation",
		mcp.WithDescription("USE WHEN you need details for a specific mutation record by ID."),
		mcp.WithString("mutation_id", mcp.Required(), mcp.Description("Mutation UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "mutation_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		m, err := svc.Strategy.GetMutation(ctx, id)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(m)
	})
}

// ---------------------------------------------------------------------------
// Read tools — semantic
// ---------------------------------------------------------------------------

func registerSemanticReadTools(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("search_strategy",
		mcp.WithDescription("USE WHEN you need semantic search across the strategy graph for an instance."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("query", mcp.Required(), mcp.Description("Natural language search query")),
		mcp.WithString("limit", mcp.Description("Max results (default 10)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		results, err := svc.Semantic.SearchStrategy(ctx,
			argString(req, "instance_id"),
			argString(req, "query"),
			argInt(req, "limit", 10),
		)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(results)
	})

	s.AddTool(mcp.NewTool("detect_contradictions",
		mcp.WithDescription("USE WHEN you need to scan for structural contradictions in the strategy graph."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		results, err := svc.Semantic.DetectContradictions(ctx, argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(results)
	})

	s.AddTool(mcp.NewTool("get_neighbors",
		mcp.WithDescription("USE WHEN you need the semantic graph neighbourhood of a strategy node — connected artifacts and edge types."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("node_key", mcp.Required(), mcp.Description("Artifact key to expand (e.g. fd-001)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		results, err := svc.Semantic.GetNeighbors(ctx,
			argString(req, "instance_id"),
			argString(req, "node_key"),
		)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(results)
	})

	s.AddTool(mcp.NewTool("run_scenario",
		mcp.WithDescription("USE WHEN you need to explore a what-if strategy branch without committing to main. Returns a scenario_id for evaluation."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("description", mcp.Required(), mcp.Description("What-if question or hypothesis")),
		mcp.WithString("anchor_node", mcp.Description("Optional artifact key to anchor the scenario")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		scenarioID, err := svc.Semantic.RunScenario(ctx,
			argString(req, "instance_id"),
			argString(req, "description"),
			argString(req, "anchor_node"),
		)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]string{"scenario_id": scenarioID})
	})

	s.AddTool(mcp.NewTool("evaluate_scenario",
		mcp.WithDescription("USE WHEN you need to assess the impact of a what-if scenario on the strategy graph."),
		mcp.WithString("scenario_id", mcp.Required(), mcp.Description("Scenario ID from run_scenario")),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		result, err := svc.Semantic.EvaluateScenario(ctx,
			argString(req, "scenario_id"),
			argString(req, "instance_id"),
		)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(result)
	})

	s.AddTool(mcp.NewTool("commit_scenario",
		mcp.WithDescription("USE WHEN you want to promote a what-if scenario's mutations into a staging batch for review and commit."),
		mcp.WithString("scenario_id", mcp.Required(), mcp.Description("Scenario ID from run_scenario")),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		batchID, err := svc.Semantic.CommitScenario(ctx,
			argString(req, "scenario_id"),
			argString(req, "instance_id"),
		)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]string{"batch_id": batchID})
	})
}

// ---------------------------------------------------------------------------
// Write tools — workspace + instance lifecycle
// ---------------------------------------------------------------------------

func registerWorkspaceWriteTools(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("create_workspace",
		mcp.WithDescription("USE WHEN you need to register a new workspace for a GitHub organisation."),
		mcp.WithString("github_owner", mcp.Required(), mcp.Description("GitHub organisation or user login")),
		mcp.WithString("display_name", mcp.Description("Human-readable workspace name")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		owner := argString(req, "github_owner")
		if owner == "" {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("github_owner is required")), nil
		}
		var namePtr *string
		if name := argString(req, "display_name"); name != "" {
			namePtr = &name
		}
		ws, err := svc.Workspace.CreateWorkspace(ctx, owner, namePtr)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(ws)
	})

	s.AddTool(mcp.NewTool("import_instance",
		mcp.WithDescription("USE WHEN you need to import EPF artifacts from a GitHub repository into a workspace."),
		mcp.WithString("workspace_id", mcp.Required(), mcp.Description("Workspace UUID")),
		mcp.WithString("name", mcp.Required(), mcp.Description("Instance display name")),
		mcp.WithString("github_repo", mcp.Description("GitHub repo slug, e.g. org/repo")),
		mcp.WithString("github_base_path", mcp.Description("Path prefix within the repo")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		wsID, err := parseUUID(argString(req, "workspace_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		p := instance.ImportParams{
			WorkspaceID: wsID,
			Name:        argString(req, "name"),
		}
		if repo := argString(req, "github_repo"); repo != "" {
			p.GithubRepo = &repo
		}
		if path := argString(req, "github_base_path"); path != "" {
			p.GithubBasePath = &path
		}
		inst, err := svc.Instance.ImportInstance(ctx, p)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(inst)
	})

	s.AddTool(mcp.NewTool("activate_instance",
		mcp.WithDescription("USE WHEN you need to set a strategy instance as the active one for its workspace."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := svc.Instance.ActivateInstance(ctx, id); err != nil {
			return toolErr(ctx, err), nil
		}
		return mcp.NewToolResultText(fmt.Sprintf(`{"activated":true,"instance_id":%q}`, id)), nil
	})

	s.AddTool(mcp.NewTool("archive_instance",
		mcp.WithDescription("USE WHEN you need to archive a strategy instance and discard its staged mutations."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := svc.Instance.ArchiveInstance(ctx, id); err != nil {
			return toolErr(ctx, err), nil
		}
		return mcp.NewToolResultText(fmt.Sprintf(`{"archived":true,"instance_id":%q}`, id)), nil
	})
}

// ---------------------------------------------------------------------------
// Write tools — artifact mutations (staged writes)
// ---------------------------------------------------------------------------

func registerMutationWriteTools(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("update_north_star",
		mcp.WithDescription("USE WHEN you need to draft a north star vision change. Returns batch_id for confirmation."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("payload", mcp.Required(), mcp.Description("JSON-encoded north star payload")),
		mcp.WithString("batch_id", mcp.Description("Existing batch UUID to append to")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return stageArtifact(ctx, req, svc.Strategy, "north_star", "north_star", "update")
	})

	s.AddTool(mcp.NewTool("create_feature",
		mcp.WithDescription("USE WHEN you need to draft a new feature definition. Returns batch_id for confirmation."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("feature_key", mcp.Required(), mcp.Description("Feature artifact key, e.g. fd-042")),
		mcp.WithString("payload", mcp.Required(), mcp.Description("JSON-encoded feature payload")),
		mcp.WithString("batch_id", mcp.Description("Existing batch UUID to append to")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return stageArtifact(ctx, req, svc.Strategy, argString(req, "feature_key"), "feature", "create")
	})

	s.AddTool(mcp.NewTool("update_feature",
		mcp.WithDescription("USE WHEN you need to draft an update to an existing feature. Returns batch_id for confirmation."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("feature_key", mcp.Required(), mcp.Description("Feature artifact key to update")),
		mcp.WithString("payload", mcp.Required(), mcp.Description("JSON-encoded updated feature payload")),
		mcp.WithString("batch_id", mcp.Description("Existing batch UUID to append to")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return stageArtifact(ctx, req, svc.Strategy, argString(req, "feature_key"), "feature", "update")
	})

	s.AddTool(mcp.NewTool("archive_feature",
		mcp.WithDescription("USE WHEN you need to draft archival of a feature. Returns batch_id for confirmation."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("feature_key", mcp.Required(), mcp.Description("Feature artifact key to archive")),
		mcp.WithString("batch_id", mcp.Description("Existing batch UUID to append to")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return stageArtifact(ctx, req, svc.Strategy, argString(req, "feature_key"), "feature", "archive")
	})
}

// ---------------------------------------------------------------------------
// Write tools — batch commit / discard
// ---------------------------------------------------------------------------

func registerBatchWriteTools(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("commit_batch",
		mcp.WithDescription("USE WHEN the user has confirmed a staged change and you need to commit the batch."),
		mcp.WithString("batch_id", mcp.Required(), mcp.Description("Batch UUID returned by a write tool")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		batchID, err := parseUUID(argString(req, "batch_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		n, err := svc.Strategy.CommitBatch(ctx, batchID)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// Enqueue async Memory ingestion for the committed batch.
		if svc.Ingest != nil {
			instanceID := svc.Strategy.InstanceIDForBatch(ctx, batchID)
			if instanceID != uuid.Nil {
				svc.Ingest.EnqueueBatch(instanceID, batchID)
			}
		}

		return mustJSON(map[string]any{"committed": true, "batch_id": batchID, "count": n})
	})

	s.AddTool(mcp.NewTool("discard_batch",
		mcp.WithDescription("USE WHEN the user has declined a staged change and you need to discard the batch."),
		mcp.WithString("batch_id", mcp.Required(), mcp.Description("Batch UUID returned by a write tool")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		batchID, err := parseUUID(argString(req, "batch_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		n, err := svc.Strategy.DiscardBatch(ctx, batchID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{"discarded": true, "batch_id": batchID, "count": n})
	})
}

// ---------------------------------------------------------------------------
// Agent runtime tools (Phase B+) — pending batches + describe
// ---------------------------------------------------------------------------

func registerAgentRuntimeTools(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("list_pending_batches",
		mcp.WithDescription("USE WHEN you need to see all staged (uncommitted) batches waiting for human review in an instance."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		batches, err := svc.Strategy.ListPendingBatches(ctx, id)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(batches)
	})

	s.AddTool(mcp.NewTool("describe_batch",
		mcp.WithDescription("USE WHEN you need to attach your agent identity and a human-readable description to a staged batch before presenting it for review."),
		mcp.WithString("batch_id", mcp.Required(), mcp.Description("Batch UUID to annotate")),
		mcp.WithString("agent_id", mcp.Required(), mcp.Description("Identifier of the agent authoring this batch, e.g. pathfinder")),
		mcp.WithString("description", mcp.Required(), mcp.Description("Human-readable summary of what this batch changes")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		batchID, err := parseUUID(argString(req, "batch_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		agentID := argString(req, "agent_id")
		description := argString(req, "description")
		if agentID == "" || description == "" {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("agent_id and description are required")), nil
		}
		if err := svc.Strategy.DescribeBatch(ctx, batchID, agentID, description); err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{
			"described":   true,
			"batch_id":    batchID,
			"agent_id":    agentID,
			"description": description,
		})
	})
}

// ---------------------------------------------------------------------------
// Expanded write tools (Phase D) — READY/FIRE artifact mutations
// ---------------------------------------------------------------------------

func registerExpandedWriteTools(s *server.MCPServer, svc Services) {
	// --- READY phase typed wrappers ---

	s.AddTool(mcp.NewTool("update_strategy_foundations",
		mcp.WithDescription("USE WHEN you need to draft an update to the strategy foundations artifact (personas, positioning, ICP). Returns batch_id for confirmation."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("payload", mcp.Required(), mcp.Description("JSON-encoded strategy_foundations payload")),
		mcp.WithString("batch_id", mcp.Description("Existing batch UUID to append to")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return stageArtifact(ctx, req, svc.Strategy, "strategy_foundations", "strategy_foundations", "update")
	})

	s.AddTool(mcp.NewTool("update_insight_analyses",
		mcp.WithDescription("USE WHEN you need to draft an update to the insight analyses artifact (competitive landscape, market trends). Returns batch_id for confirmation."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("payload", mcp.Required(), mcp.Description("JSON-encoded insight_analyses payload")),
		mcp.WithString("batch_id", mcp.Description("Existing batch UUID to append to")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return stageArtifact(ctx, req, svc.Strategy, "insight_analyses", "insight_analyses", "update")
	})

	s.AddTool(mcp.NewTool("update_strategy_formula",
		mcp.WithDescription("USE WHEN you need to draft an update to the strategy formula artifact (vision, bets, OKRs). Returns batch_id for confirmation."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("payload", mcp.Required(), mcp.Description("JSON-encoded strategy_formula payload")),
		mcp.WithString("batch_id", mcp.Description("Existing batch UUID to append to")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return stageArtifact(ctx, req, svc.Strategy, "strategy_formula", "strategy_formula", "update")
	})

	s.AddTool(mcp.NewTool("update_roadmap",
		mcp.WithDescription("USE WHEN you need to draft an update to the roadmap recipe artifact (phased feature delivery plan). Returns batch_id for confirmation."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("payload", mcp.Required(), mcp.Description("JSON-encoded roadmap_recipe payload")),
		mcp.WithString("batch_id", mcp.Description("Existing batch UUID to append to")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return stageArtifact(ctx, req, svc.Strategy, "roadmap_recipe", "roadmap_recipe", "update")
	})

	// --- FIRE typed wrappers ---

	s.AddTool(mcp.NewTool("update_value_model",
		mcp.WithDescription("USE WHEN you need to draft an update to a value model artifact for a specific track (product, commercial, org_ops). Returns batch_id for confirmation."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("track", mcp.Required(), mcp.Description("Value model track, e.g. product, commercial, org_ops")),
		mcp.WithString("payload", mcp.Required(), mcp.Description("JSON-encoded value model payload")),
		mcp.WithString("batch_id", mcp.Description("Existing batch UUID to append to")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		track := argString(req, "track")
		if track == "" {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("track is required")), nil
		}
		artifactKey := "value_model_" + track + ".value_model"
		return stageArtifact(ctx, req, svc.Strategy, artifactKey, "value_model", "update")
	})

	// --- Generic escape hatch ---

	s.AddTool(mcp.NewTool("stage_artifact",
		mcp.WithDescription("USE WHEN you need to stage any EPF artifact type that doesn't have a dedicated write tool (e.g. org_ops_def, commercial_def, strategy_def, insight_opportunity, mappings). Returns batch_id for confirmation."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("artifact_type", mcp.Required(), mcp.Description("EPF artifact type, e.g. commercial_def, org_ops_def, strategy_def, value_model")),
		mcp.WithString("artifact_key", mcp.Required(), mcp.Description("Artifact key, e.g. fd-042 or FIRE/definitions/commercial/financing/cd-010")),
		mcp.WithString("action", mcp.Required(), mcp.Description("Mutation action: create, update, or archive")),
		mcp.WithString("payload", mcp.Description("JSON-encoded artifact payload (required for create/update)")),
		mcp.WithString("batch_id", mcp.Description("Existing batch UUID to append to")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		action := argString(req, "action")
		switch action {
		case "create", "update", "archive":
		default:
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("action must be create, update, or archive")), nil
		}
		artifactType := argString(req, "artifact_type")
		artifactKey := argString(req, "artifact_key")
		if artifactType == "" || artifactKey == "" {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("artifact_type and artifact_key are required")), nil
		}
		return stageArtifact(ctx, req, svc.Strategy, artifactKey, artifactType, action)
	})

	// --- Multi-artifact staging ---

	s.AddTool(mcp.NewTool("batch_create_artifacts",
		mcp.WithDescription("USE WHEN you need to stage multiple new artifacts in a single batch — e.g. creating several features or definition files at once. All mutations share one batch_id. Returns batch_id for confirmation."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("artifacts", mcp.Required(), mcp.Description(`JSON array of artifacts to stage. Each item: {"artifact_type":"feature","artifact_key":"fd-042","payload":{...}}`)),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		artifactsJSON := argString(req, "artifacts")
		if artifactsJSON == "" {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("artifacts is required")), nil
		}

		var items []struct {
			ArtifactType string          `json:"artifact_type"`
			ArtifactKey  string          `json:"artifact_key"`
			Payload      json.RawMessage `json:"payload"`
		}
		if err := json.Unmarshal([]byte(artifactsJSON), &items); err != nil {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("artifacts must be a JSON array: "+err.Error())), nil
		}
		if len(items) == 0 {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("artifacts array must not be empty")), nil
		}

		var batchID *uuid.UUID
		stagedKeys := make([]string, 0, len(items))

		for _, item := range items {
			if item.ArtifactType == "" || item.ArtifactKey == "" {
				return toolErr(ctx, apperror.ErrBadRequest.WithDetail("each artifact must have artifact_type and artifact_key")), nil
			}
			payload := item.Payload
			if len(payload) == 0 {
				payload = json.RawMessage("{}")
			}

			p := strategy.StageParams{
				InstanceID:   instID,
				ArtifactType: item.ArtifactType,
				ArtifactKey:  item.ArtifactKey,
				Action:       "create",
				Payload:      payload,
				BatchID:      batchID,
			}
			newBatchID, err := svc.Strategy.Stage(ctx, p)
			if err != nil {
				return toolErr(ctx, err), nil
			}
			if batchID == nil {
				batchID = &newBatchID
			}
			stagedKeys = append(stagedKeys, item.ArtifactKey)
		}

		return mustJSON(map[string]any{
			"staged":        true,
			"batch_id":      batchID,
			"artifact_keys": stagedKeys,
			"count":         len(stagedKeys),
			"note":          "Present this batch_id to the user for review. Call commit_batch only after explicit confirmation.",
		})
	})
}

// ---------------------------------------------------------------------------
// Read tools — embedded EPF knowledge (schemas, templates, agents, skills, wizards)
// ---------------------------------------------------------------------------

func registerEmbeddedKnowledgeTools(s *server.MCPServer) {
	// --- Agent routing ---
	s.AddTool(mcp.NewTool("get_agent_for_task",
		mcp.WithDescription("USE FIRST to route any task to the right tool or agent. Returns direct_tool or agent recommendation."),
		mcp.WithString("task_description", mcp.Required(), mcp.Description("Natural-language description of what you want to do")),
	), func(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		desc := argString(req, "task_description")
		if desc == "" {
			return mcp.NewToolResultError("task_description is required"), nil
		}
		result := agent.RouteTask(desc)
		return mustJSON(result)
	})

	// --- Schemas ---
	s.AddTool(mcp.NewTool("list_schemas",
		mcp.WithDescription("USE WHEN you need to discover which EPF artifact schemas are available for validation or authoring guidance."),
	), func(ctx context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		names, err := embedded.ListSchemas()
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{"schemas": names, "version": embedded.Version})
	})

	s.AddTool(mcp.NewTool("get_schema",
		mcp.WithDescription("USE WHEN you need the full JSON Schema for a specific EPF artifact type to validate content or understand required fields."),
		mcp.WithString("filename", mcp.Required(), mcp.Description("Schema filename, e.g. feature_definition_schema.json")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		data, err := embedded.GetSchema(argString(req, "filename"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mcp.NewToolResultText(string(data)), nil
	})

	// --- Templates ---
	s.AddTool(mcp.NewTool("list_templates",
		mcp.WithDescription("USE WHEN you need to see all available EPF artifact templates across READY, FIRE, and AIM phases."),
	), func(ctx context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		paths, err := embedded.ListTemplates()
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{"templates": paths, "version": embedded.Version})
	})

	s.AddTool(mcp.NewTool("get_template",
		mcp.WithDescription("USE WHEN you need the YAML template for a specific EPF artifact to scaffold a new artifact or understand its structure."),
		mcp.WithString("path", mcp.Required(), mcp.Description("Template path relative to templates root, e.g. READY/00_north_star.yaml")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		data, err := embedded.GetTemplate(argString(req, "path"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mcp.NewToolResultText(string(data)), nil
	})

	// --- Agents ---
	s.AddTool(mcp.NewTool("list_agents",
		mcp.WithDescription("USE WHEN you need to discover which EPF AI agents are available for orchestrating authoring workflows."),
	), func(ctx context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		names, err := embedded.ListAgents()
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{"agents": names, "version": embedded.Version})
	})

	s.AddTool(mcp.NewTool("get_agent",
		mcp.WithDescription("USE WHEN you need the full agent definition (metadata + prompt) for a specific EPF agent to activate it or understand its capabilities."),
		mcp.WithString("name", mcp.Required(), mcp.Description("Agent directory name, e.g. pathfinder")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		name := argString(req, "name")
		agentYAML, err := embedded.GetAgentYAML(name)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		prompt, err := embedded.GetAgentPrompt(name)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		result := map[string]any{
			"name":       name,
			"agent_yaml": string(agentYAML),
		}
		if len(prompt) > 0 {
			result["prompt"] = string(prompt)
		}
		return mustJSON(result)
	})

	// --- Skills ---
	s.AddTool(mcp.NewTool("list_skills",
		mcp.WithDescription("USE WHEN you need to discover which EPF skills are available to guide a specific authoring task."),
	), func(ctx context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		names, err := embedded.ListSkills()
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{"skills": names, "version": embedded.Version})
	})

	s.AddTool(mcp.NewTool("get_skill",
		mcp.WithDescription("USE WHEN you need the full skill definition (metadata + prompt) for a specific EPF skill to execute a guided authoring workflow."),
		mcp.WithString("name", mcp.Required(), mcp.Description("Skill directory name, e.g. feature-definition")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		name := argString(req, "name")
		skillYAML, err := embedded.GetSkillYAML(name)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		prompt, err := embedded.GetSkillPrompt(name)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		result := map[string]any{
			"name":       name,
			"skill_yaml": string(skillYAML),
		}
		if len(prompt) > 0 {
			result["prompt"] = string(prompt)
		}
		return mustJSON(result)
	})

	// --- Wizards (legacy) ---
	s.AddTool(mcp.NewTool("list_wizards",
		mcp.WithDescription("USE WHEN you need to discover available legacy EPF wizard files for artifact authoring guidance."),
	), func(ctx context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		names, err := embedded.ListWizards()
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{"wizards": names, "version": embedded.Version})
	})

	s.AddTool(mcp.NewTool("get_wizard",
		mcp.WithDescription("USE WHEN you need the full wizard instructions for a specific EPF artifact type (legacy format)."),
		mcp.WithString("filename", mcp.Required(), mcp.Description("Wizard filename, e.g. feature_definition.wizard.md")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		data, err := embedded.GetWizard(argString(req, "filename"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mcp.NewToolResultText(string(data)), nil
	})
}

// ---------------------------------------------------------------------------
// Phase G: AIM lifecycle tools
// ---------------------------------------------------------------------------

func registerAIMTools(s *server.MCPServer, svc Services) {
	// create_lra — stage a new Living Reality Assessment.
	s.AddTool(mcp.NewTool("create_lra",
		mcp.WithDescription("USE WHEN you need to create a new Living Reality Assessment (LRA) artifact for an instance — captures the current strategic context before a launch or AIM cycle. Stages a mutation; call commit_batch after review."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("artifact_key", mcp.Required(), mcp.Description("Unique LRA key, e.g. lra-2025-q1")),
		mcp.WithString("payload", mcp.Required(), mcp.Description("LRA JSON payload conforming to living_reality_assessment_schema")),
		mcp.WithString("batch_id", mcp.Description("Optional batch UUID to group with other staged mutations")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		payloadStr := argString(req, "payload")
		if !json.Valid([]byte(payloadStr)) {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("payload must be valid JSON")), nil
		}
		var batchID *uuid.UUID
		if bStr := argString(req, "batch_id"); bStr != "" {
			bid, err := parseUUID(bStr)
			if err != nil {
				return toolErr(ctx, err), nil
			}
			batchID = &bid
		}
		bID, err := svc.Strategy.StageLRA(ctx, instID, argString(req, "artifact_key"), json.RawMessage(payloadStr), batchID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{
			"staged":        true,
			"batch_id":      bID,
			"artifact_key":  argString(req, "artifact_key"),
			"artifact_type": "living_reality_assessment",
			"note":          "Present this batch_id to the user for review. Call commit_batch only after explicit confirmation.",
		})
	})

	// update_lra — stage an update to an existing LRA.
	s.AddTool(mcp.NewTool("update_lra",
		mcp.WithDescription("USE WHEN you need to update an existing LRA artifact — e.g. to revise findings or update strategic alignment. Stages a mutation; call commit_batch after review."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("artifact_key", mcp.Required(), mcp.Description("LRA artifact key to update")),
		mcp.WithString("payload", mcp.Required(), mcp.Description("Updated LRA JSON payload")),
		mcp.WithString("batch_id", mcp.Description("Optional batch UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		payloadStr := argString(req, "payload")
		if !json.Valid([]byte(payloadStr)) {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("payload must be valid JSON")), nil
		}
		var batchID *uuid.UUID
		if bStr := argString(req, "batch_id"); bStr != "" {
			bid, err := parseUUID(bStr)
			if err != nil {
				return toolErr(ctx, err), nil
			}
			batchID = &bid
		}
		bID, err := svc.Strategy.UpdateLRA(ctx, instID, argString(req, "artifact_key"), json.RawMessage(payloadStr), batchID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{
			"staged":        true,
			"batch_id":      bID,
			"artifact_key":  argString(req, "artifact_key"),
			"artifact_type": "living_reality_assessment",
			"note":          "Present this batch_id to the user for review. Call commit_batch only after explicit confirmation.",
		})
	})

	// get_lra — read the current state of an LRA artifact.
	s.AddTool(mcp.NewTool("get_lra",
		mcp.WithDescription("USE WHEN you need to read the current state of a Living Reality Assessment artifact."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("artifact_key", mcp.Required(), mcp.Description("LRA artifact key, e.g. lra-2025-q1")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		raw, err := svc.Strategy.GetLRA(ctx, instID, argString(req, "artifact_key"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mcp.NewToolResultText(string(raw)), nil
	})

	// create_aim_report — stage a new AIM assessment report.
	s.AddTool(mcp.NewTool("create_aim_report",
		mcp.WithDescription("USE WHEN you need to create a post-launch AIM assessment report — captures OKR progress, assumption validations, and strategic insights for a completed cycle. Stages a mutation; call commit_batch after review."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("artifact_key", mcp.Required(), mcp.Description("Unique report key, e.g. aim-report-2025-q1")),
		mcp.WithString("payload", mcp.Required(), mcp.Description("Assessment report JSON payload conforming to assessment_report_schema")),
		mcp.WithString("batch_id", mcp.Description("Optional batch UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		payloadStr := argString(req, "payload")
		if !json.Valid([]byte(payloadStr)) {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("payload must be valid JSON")), nil
		}
		var batchID *uuid.UUID
		if bStr := argString(req, "batch_id"); bStr != "" {
			bid, err := parseUUID(bStr)
			if err != nil {
				return toolErr(ctx, err), nil
			}
			batchID = &bid
		}
		bID, err := svc.Strategy.StageAIMReport(ctx, instID, argString(req, "artifact_key"), json.RawMessage(payloadStr), batchID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{
			"staged":        true,
			"batch_id":      bID,
			"artifact_key":  argString(req, "artifact_key"),
			"artifact_type": "assessment_report",
			"note":          "Present this batch_id to the user for review. Call commit_batch only after explicit confirmation.",
		})
	})

	// get_aim_summary — AIM phase overview for an instance.
	s.AddTool(mcp.NewTool("get_aim_summary",
		mcp.WithDescription("USE WHEN you need an overview of the AIM phase for an instance — lists all LRAs, assessment reports, and trigger configs with counts."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		summary, err := svc.Strategy.GetAIMSummary(ctx, instID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(summary)
	})
}

// ---------------------------------------------------------------------------
// Phase F: Validation tools
// ---------------------------------------------------------------------------

func registerValidationTools(s *server.MCPServer, svc Services) {
	// validate_artifact — validate a single JSON payload against its EPF schema.
	s.AddTool(mcp.NewTool("validate_artifact",
		mcp.WithDescription("USE WHEN you want to validate a JSON artifact payload against its EPF schema. Auto-detects the artifact type when not provided. Returns valid/invalid status plus a list of schema errors."),
		mcp.WithString("payload", mcp.Required(), mcp.Description("JSON payload of the artifact to validate")),
		mcp.WithString("artifact_type", mcp.Description("EPF artifact type (e.g. feature, north_star). Auto-detected when omitted.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		payloadStr := argString(req, "payload")
		if !json.Valid([]byte(payloadStr)) {
			return mustJSON(embedded.ValidationResult{
				Valid:  false,
				Errors: []string{"payload is not valid JSON"},
			})
		}

		// Use registry-backed schema source when available.
		var source embedded.SchemaSource
		if svc.Schema != nil {
			source = schemadom.NewRegistrySchemaSource(ctx, svc.Schema, "", "standard")
		}
		result := embedded.ValidateArtifactWithSource(argString(req, "artifact_type"), []byte(payloadStr), source)
		return mustJSON(result)
	})

	// validate_instance — validate all artifacts in an instance against their schemas.
	s.AddTool(mcp.NewTool("validate_instance",
		mcp.WithDescription("USE WHEN you need a full validation report for all artifacts in a strategy instance — schema validation for each artifact type."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		artifacts, err := svc.Strategy.ListCurrentArtifacts(ctx, instID, "")
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// Build a schema source from the instance's schema version when the registry is available.
		var source embedded.SchemaSource
		if svc.Schema != nil {
			inst, instErr := svc.Instance.GetInstance(ctx, instID)
			if instErr == nil {
				version := ""
				if inst.SchemaVersion != nil {
					version = *inst.SchemaVersion
				}
				source = schemadom.NewRegistrySchemaSource(ctx, svc.Schema, version, inst.Dialect)
			}
		}

		type artifactValidation struct {
			ArtifactKey string `json:"artifact_key"`
			embedded.ValidationResult
		}
		results := make([]artifactValidation, 0, len(artifacts))
		totalValid, totalInvalid := 0, 0
		for _, a := range artifacts {
			r := embedded.ValidateArtifactWithSource(a.ArtifactType, a.Payload, source)
			results = append(results, artifactValidation{
				ArtifactKey:      a.ArtifactKey,
				ValidationResult: r,
			})
			if r.Valid {
				totalValid++
			} else {
				totalInvalid++
			}
		}
		return mustJSON(map[string]any{
			"instance_id":    instID,
			"artifact_count": len(artifacts),
			"valid_count":    totalValid,
			"invalid_count":  totalInvalid,
			"results":        results,
		})
	})

	// validate_relationships — check cross-artifact reference integrity.
	s.AddTool(mcp.NewTool("validate_relationships",
		mcp.WithDescription("USE WHEN you need to check cross-artifact reference integrity — verifies that relationship target_keys resolve to actual artifacts in strategy_artifacts."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// Build a set of all known artifact keys.
		artifacts, err := svc.Strategy.ListCurrentArtifacts(ctx, instID, "")
		if err != nil {
			return toolErr(ctx, err), nil
		}
		knownKeys := make(map[string]bool, len(artifacts))
		for _, a := range artifacts {
			knownKeys[a.ArtifactKey] = true
		}

		// Load all relationships.
		type brokenRef struct {
			SourceKey    string `json:"source_key"`
			Relationship string `json:"relationship"`
			TargetKey    string `json:"target_key"`
			TargetType   string `json:"target_type"`
		}
		var broken []brokenRef
		totalChecked := 0

		for _, a := range artifacts {
			rels, err := svc.Strategy.ListRelationships(ctx, instID, a.ArtifactKey)
			if err != nil {
				continue
			}
			for _, r := range rels {
				if r.SourceKey != a.ArtifactKey {
					continue // only check outbound
				}
				totalChecked++
				// Only check references to artifact types that land in strategy_artifacts.
				// Value model paths and track names are strings, not artifact keys — skip them.
				checkableTypes := map[string]bool{
					"feature": true, "assumption": true, "key_result": true,
					"track": true, "persona": true,
				}
				if !checkableTypes[r.TargetType] {
					continue
				}
				if !knownKeys[r.TargetKey] {
					broken = append(broken, brokenRef{
						SourceKey:    r.SourceKey,
						Relationship: r.Relationship,
						TargetKey:    r.TargetKey,
						TargetType:   r.TargetType,
					})
				}
			}
		}

		return mustJSON(map[string]any{
			"instance_id":           instID,
			"relationships_checked": totalChecked,
			"broken_count":          len(broken),
			"broken":                broken,
			"valid":                 len(broken) == 0,
		})
	})

	// check_content_readiness — score content quality for one or all artifacts.
	s.AddTool(mcp.NewTool("check_content_readiness",
		mcp.WithDescription("USE WHEN you need to score the content quality of an artifact — checks for presence of recommended fields and returns a 0-100 readiness score. Omit artifact_key to check all features in the instance."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("artifact_key", mcp.Description("Optional artifact key. If omitted, scores all features.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		artifactKey := argString(req, "artifact_key")
		if artifactKey != "" {
			// Single artifact.
			a, err := svc.Strategy.GetCurrentArtifactFull(ctx, instID, artifactKey)
			if err != nil {
				return toolErr(ctx, err), nil
			}
			report := embedded.CheckContentReadiness(a.ArtifactType, a.ArtifactKey, a.Payload)
			return mustJSON(report)
		}

		// All features.
		artifacts, err := svc.Strategy.ListCurrentArtifacts(ctx, instID, "feature")
		if err != nil {
			return toolErr(ctx, err), nil
		}
		reports := make([]embedded.ReadinessReport, 0, len(artifacts))
		totalScore := 0
		for _, a := range artifacts {
			r := embedded.CheckContentReadiness(a.ArtifactType, a.ArtifactKey, a.Payload)
			reports = append(reports, r)
			totalScore += r.Score
		}
		avgScore := 0
		if len(artifacts) > 0 {
			avgScore = totalScore / len(artifacts)
		}
		return mustJSON(map[string]any{
			"instance_id":   instID,
			"feature_count": len(artifacts),
			"average_score": avgScore,
			"reports":       reports,
		})
	})
}

// ---------------------------------------------------------------------------
// Phase F: Export tools
// ---------------------------------------------------------------------------

func registerExportTools(s *server.MCPServer, svc Services) {
	// export_instance_yaml — export all artifacts as EPF YAML directory structure.
	s.AddTool(mcp.NewTool("export_instance_yaml",
		mcp.WithDescription("USE WHEN you need to export all committed artifacts for an instance as EPF-structured YAML files. Returns a list of {rel_path, content} entries matching the EPF directory layout (READY/, FIRE/, AIM/)."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		result, err := svc.Strategy.ExportInstance(ctx, instID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(result)
	})

	// export_feature_yaml — export a single feature artifact as YAML.
	s.AddTool(mcp.NewTool("export_feature_yaml",
		mcp.WithDescription("USE WHEN you need the YAML representation of a single feature artifact — returns {rel_path, content} ready to write to the EPF directory."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("feature_key", mcp.Required(), mcp.Description("Feature artifact key")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		entry, err := svc.Strategy.ExportFeature(ctx, instID, argString(req, "feature_key"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(entry)
	})

	// export_report — formatted Markdown strategy report.
	s.AddTool(mcp.NewTool("export_report",
		mcp.WithDescription("USE WHEN you need a structured Markdown strategy report for an instance — includes artifact inventory, value propositions, value path coverage, and assumptions under test."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		report, err := svc.Strategy.ExportReport(ctx, instID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(report)
	})
}

// ---------------------------------------------------------------------------
// Phase E: Derived read views (cross-artifact queries)
// ---------------------------------------------------------------------------

func registerDerivedReadTools(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("get_strategic_context_for_feature",
		mcp.WithDescription("USE WHEN you need full strategic context for a single feature: its artifact payload plus all indexed relationships grouped by type (contributes_to, tests_assumptions, depends_on, enables, in_tracks)."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("feature_key", mcp.Required(), mcp.Description("Feature artifact key, e.g. FIRE/definitions/features/my_feature.yaml")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		result, err := svc.Strategy.GetStrategicContextForFeature(ctx, instID, argString(req, "feature_key"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(result)
	})

	s.AddTool(mcp.NewTool("explain_value_path",
		mcp.WithDescription("USE WHEN you need to see which value model paths a specific feature contributes to (its contributes_to edges)."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("feature_key", mcp.Required(), mcp.Description("Feature artifact key")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		paths, err := svc.Strategy.ExplainValuePath(ctx, instID, argString(req, "feature_key"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{
			"feature_key": argString(req, "feature_key"),
			"value_paths": paths,
			"path_count":  len(paths),
		})
	})

	s.AddTool(mcp.NewTool("get_coverage_analysis",
		mcp.WithDescription("USE WHEN you need a matrix of which value model paths are covered by which features — useful for gap analysis or roadmap review."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		entries, err := svc.Strategy.GetCoverageAnalysis(ctx, instID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{
			"coverage":   entries,
			"path_count": len(entries),
		})
	})

	s.AddTool(mcp.NewTool("get_value_propositions",
		mcp.WithDescription("USE WHEN you need a cross-feature view of what value each feature delivers — all features with their contributes_to value paths."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		propositions, err := svc.Strategy.GetValuePropositions(ctx, instID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{
			"features":      propositions,
			"feature_count": len(propositions),
		})
	})

	s.AddTool(mcp.NewTool("get_assumptions",
		mcp.WithDescription("USE WHEN you need to see all strategic assumptions and which features test each one (tests_assumption relationships)."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		assumptions, err := svc.Strategy.GetAssumptions(ctx, instID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{
			"assumptions":      assumptions,
			"assumption_count": len(assumptions),
		})
	})

	s.AddTool(mcp.NewTool("get_feature_dependencies",
		mcp.WithDescription("USE WHEN you need the full dependency graph for an instance — all depends_on and enables edges between features."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		graph, err := svc.Strategy.GetFeatureDependencies(ctx, instID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(graph)
	})
}

// mustJSON marshals v to JSON and returns a text result, or a tool error on failure.
func mustJSON(v any) (*mcp.CallToolResult, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return mcp.NewToolResultError(fmt.Sprintf("marshal result: %v", err)), nil
	}
	return mcp.NewToolResultText(string(b)), nil
}

// stageArtifact is a shared helper that stages a mutation and returns the batch_id.
func stageArtifact(
	ctx context.Context,
	req mcp.CallToolRequest,
	svc *strategy.Service,
	artifactKey string,
	artifactType string,
	action string,
) (*mcp.CallToolResult, error) {
	instID, err := parseUUID(argString(req, "instance_id"))
	if err != nil {
		return toolErr(ctx, err), nil
	}

	var payloadRaw json.RawMessage
	payloadStr := argString(req, "payload")
	if payloadStr != "" {
		if !json.Valid([]byte(payloadStr)) {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("payload must be valid JSON")), nil
		}
		payloadRaw = json.RawMessage(payloadStr)
	} else {
		payloadRaw = json.RawMessage("{}")
	}

	p := strategy.StageParams{
		InstanceID:   instID,
		ArtifactType: artifactType,
		ArtifactKey:  artifactKey,
		Action:       action,
		Payload:      payloadRaw,
	}

	if batchStr := argString(req, "batch_id"); batchStr != "" {
		bID, err := parseUUID(batchStr)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		p.BatchID = &bID
	}

	batchID, err := svc.Stage(ctx, p)
	if err != nil {
		return toolErr(ctx, err), nil
	}

	return mustJSON(map[string]any{
		"staged":       true,
		"batch_id":     batchID,
		"artifact_key": artifactKey,
		"action":       action,
		"note":         "Present this batch_id to the user for review. Call commit_batch only after explicit confirmation.",
	})
}

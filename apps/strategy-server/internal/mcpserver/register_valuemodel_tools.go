package mcpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/valuemodel"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/verdict"
)

// trackDefTypes maps a value model's track to the artifact type carrying the
// definitions that may contribute to it.
var trackDefTypes = map[string]string{
	"product":    "feature",
	"strategy":   "strategy_def",
	"org_ops":    "org_ops_def",
	"orgops":     "org_ops_def",
	"commercial": "commercial_def",
}

func normTrack(s string) string {
	return strings.ToLower(strings.NewReplacer("-", "", "_", "", " ", "").Replace(s))
}

// valueModelLinkReport is the detail channel of validate_value_model_links.
//
// Every count is reported as a pair against a denominator established
// independently of the thing being counted: components come from the value
// models, paths from the definition payloads, and neither number is derived
// from how many the resolver managed to place. A rate computed over the
// subjects a reader could see is not a measurement — strategy-server reported
// contributes_to resolution at "135 of 135, 100%" while reading 135 of the 198
// paths that existed, because the 63 it could not see were absent from the
// denominator as well as the numerator.
type valueModelLinkReport struct {
	InstanceID string `json:"instance_id"`

	PathsFound     int `json:"paths_found"`
	PathsResolved  int `json:"paths_resolved"`
	PathsToActive  int `json:"paths_to_active_component"`
	PathsToDormant int `json:"paths_to_dormant_component"`

	ActiveComponents int `json:"active_components"`
	ActiveServed     int `json:"active_components_served"`

	DormantComponents int `json:"dormant_components_ignored"`

	Unresolved []unresolvedPath `json:"unresolved,omitempty"`
	Unserved   []componentRef   `json:"unserved_active_components,omitempty"`
}

type unresolvedPath struct {
	DefinitionKey string `json:"definition_key"`
	Path          string `json:"path"`
	Reason        string `json:"reason"`
}

type componentRef struct {
	ValueModelKey string `json:"value_model_key"`
	ComponentID   string `json:"component_id"`
	ComponentName string `json:"component_name"`
}

func registerValueModelLinkTools(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("validate_value_model_links",
		mcp.WithDescription("USE WHEN you need to check that every contributes_to path names a real value model component, and that every active component has at least one mechanism serving it. Reports two independent pairs: paths resolved of paths found, and active components served of active components. Components marked inactive are canonical scaffolding the instance does not use — they are excluded from both denominators and reported only as a count."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		withVerdictOutput(),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		vms, err := svc.Strategy.ListCurrentArtifacts(ctx, instID, "value_model")
		if err != nil {
			return toolErr(ctx, err), nil
		}
		// A validation with no subject fails rather than reporting a clean
		// instance: "every path resolves" and "no value model was found" are
		// not the same answer, and only one of them is good news.
		if len(vms) == 0 {
			return toolErr(ctx, fmt.Errorf("instance %s has no value_model artifacts: there is nothing to validate contributes_to paths against", instID)), nil
		}

		rep := valueModelLinkReport{InstanceID: instID.String()}
		var findings []verdict.Finding

		// Models by track, and the active component census — both counted from
		// the value models themselves, before any path is examined.
		byTrack := map[string][]modelRef{}
		served := map[string]bool{}
		active := map[string]componentRef{}

		for _, vm := range vms {
			var payload map[string]any
			if err := json.Unmarshal(vm.Payload, &payload); err != nil {
				return toolErr(ctx, fmt.Errorf("value model %s: %w", vm.ArtifactKey, err)), nil
			}
			m := valuemodel.ParseModel(payload)
			byTrack[normTrack(m.Track)] = append(byTrack[normTrack(m.Track)], modelRef{vm.ArtifactKey, m})
			for _, l := range m.Layers {
				for _, c := range l.Components {
					if c.Active() {
						active[vm.ArtifactKey+"|"+c.ID] = componentRef{vm.ArtifactKey, c.ID, c.Name}
					} else {
						rep.DormantComponents++
					}
				}
			}
		}
		rep.ActiveComponents = len(active)

		// Definitions, per track, resolved against that track's models.
		for track, models := range byTrack {
			defType, ok := trackDefTypes[track]
			if !ok {
				continue
			}
			defs, err := svc.Strategy.ListCurrentArtifacts(ctx, instID, defType)
			if err != nil {
				return toolErr(ctx, err), nil
			}
			for _, d := range defs {
				var payload map[string]any
				if err := json.Unmarshal(d.Payload, &payload); err != nil {
					continue
				}
				for _, path := range valuemodel.ContributesTo(payload) {
					rep.PathsFound++
					if !resolvePath(path, models, &rep, served, active) {
						reason := lastResolveError(path, models)
						rep.Unresolved = append(rep.Unresolved, unresolvedPath{d.ArtifactKey, path, reason})
						findings = append(findings, verdict.Finding{
							Severity: verdict.SeverityError,
							Key:      d.ArtifactKey,
							Rule:     "value_model.unresolvable_path",
							Path:     "/contributes_to/" + path,
							Message: fmt.Sprintf("contributes_to path %q names no component in any %s value model: %s",
								path, track, reason),
						})
					}
				}
			}
		}

		for k, c := range active {
			if served[k] {
				rep.ActiveServed++
				continue
			}
			rep.Unserved = append(rep.Unserved, c)
			findings = append(findings, verdict.Finding{
				Severity: verdict.SeverityWarning,
				Key:      c.ValueModelKey,
				Rule:     "value_model.active_component_unserved",
				Path:     "/components/" + c.ComponentID,
				Message:  fmt.Sprintf("component %q is active but no definition contributes to it: the strategy claims this value with no mechanism delivering it", c.ComponentName),
			})
		}

		return verdictResult(
			verdict.New(rep.PathsFound+rep.ActiveComponents, findings).
				WithSummary("%d of %d contributes_to paths resolve; %d of %d active components served (%d dormant components ignored)",
					rep.PathsResolved, rep.PathsFound, rep.ActiveServed, rep.ActiveComponents, rep.DormantComponents),
			rep)
	})
}

// resolvePath places one path and records what it reached. Returns false only
// when the path names nothing in any model of its track.
type modelRef struct {
	key   string
	model valuemodel.Model
}

func resolvePath(path string, models []modelRef, rep *valueModelLinkReport, served map[string]bool, active map[string]componentRef) bool {
	for _, mr := range models {
		match, err := mr.model.Resolve(path)
		if err != nil {
			continue
		}
		rep.PathsResolved++
		k := mr.key + "|" + match.ComponentID
		if _, isActive := active[k]; isActive {
			served[k] = true
			rep.PathsToActive++
		} else {
			rep.PathsToDormant++
		}
		return true
	}
	return false
}

func lastResolveError(path string, models []modelRef) string {
	for _, mr := range models {
		if _, err := mr.model.Resolve(path); err != nil {
			return err.Error()
		}
	}
	return "no value model for this track"
}

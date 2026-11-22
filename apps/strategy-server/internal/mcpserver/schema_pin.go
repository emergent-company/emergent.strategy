package mcpserver

import (
	"context"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/pack"
	schemadom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/schema"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
)

// instanceSchema is the schema an instance is validated against: the version it
// is pinned to when the registry holds it, otherwise the newest the registry has.
type instanceSchema struct {
	source embedded.SchemaSource
	// used is the version that judges the instance's artifacts.
	used string
	// pinned is the version recorded on the instance, which may not be the one used.
	pinned string
}

func embeddedSchemaVersion() string { return strings.TrimSpace(embedded.Version) }

func resolveInstanceSchema(ctx context.Context, svc Services, inst *domain.StrategyInstance) instanceSchema {
	pinned := ""
	if inst != nil && inst.SchemaVersion != nil {
		pinned = *inst.SchemaVersion
	}
	out := instanceSchema{pinned: pinned, used: embeddedSchemaVersion()}
	if svc.Schema == nil || inst == nil {
		return out
	}
	out.source = schemadom.NewRegistrySchemaSource(ctx, svc.Schema, pinned, inst.Dialect)
	if pinned != "" {
		if ok, err := svc.Schema.VersionExists(ctx, pinned); err == nil && ok {
			out.used = pinned
			return out
		}
	}
	if latest, ok, err := svc.Schema.LatestVersion(ctx); err == nil && ok {
		out.used = latest
	}
	return out
}

// versionNote says, in a validation summary, that the instance was judged by a
// version other than the one this server embeds. Empty when they agree.
func (s instanceSchema) versionNote() string {
	current := embeddedSchemaVersion()
	if s.used == current {
		return ""
	}
	return fmt.Sprintf("judged by schema version %s (the instance's pin); this server embeds %s, "+
		"so a value added since %s reads as invalid here. upgrade_instance_schema shows what moving to %s would change",
		s.used, current, s.used, current)
}

func registerUpgradeInstanceSchemaTool(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("upgrade_instance_schema",
		mcp.WithDescription("USE WHEN validate_instance rejects values the current framework accepts, or health_check says the schema or the standard pack is not up to date. An instance is validated against the schema version it was created on (its pin); this tool moves the pin to the version the server embeds, and refreshes the emergent-standard pack. By default it changes nothing and reports what would change: the artifacts that become valid, the artifacts that become invalid, and the skills of the standard pack that would be replaced. Pass apply=true to do it. Replacing the pack overwrites edits made to its skills in this instance."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithBoolean("apply", mcp.Description("Move the instance to the server's schema version and refresh the standard pack. Omit or false to only report.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := assertInstanceAccess(ctx, svc, instID); err != nil {
			return toolErr(ctx, err), nil
		}
		inst, err := svc.Instance.GetInstance(ctx, instID)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		artifacts, err := svc.Strategy.ListCurrentArtifacts(ctx, instID, "")
		if err != nil {
			return toolErr(ctx, err), nil
		}

		target := embeddedSchemaVersion()
		current := resolveInstanceSchema(ctx, svc, inst)
		targetSource := embedded.EmbeddedSchemaSource()

		type invalidNow struct {
			ArtifactKey string   `json:"artifact_key"`
			Errors      []string `json:"errors"`
		}
		newlyValid := []string{}
		newlyInvalid := []invalidNow{}
		stillValid, stillInvalid := 0, 0
		for _, a := range artifacts {
			was := embedded.ValidateArtifactWithSource(a.ArtifactType, a.Payload, current.source)
			now := embedded.ValidateArtifactWithSource(a.ArtifactType, a.Payload, targetSource)
			switch {
			case !was.Valid && now.Valid:
				newlyValid = append(newlyValid, a.ArtifactKey)
			case was.Valid && !now.Valid:
				errs, _ := compactErrors(now.Errors)
				newlyInvalid = append(newlyInvalid, invalidNow{ArtifactKey: a.ArtifactKey, Errors: errs})
			case now.Valid:
				stillValid++
			default:
				stillInvalid++
			}
		}

		packInfo := map[string]any{"target_version": target, "installed": false}
		packCurrent := true
		if svc.Pack != nil {
			packCurrent = false
			if packs, perr := svc.Pack.ListInstalledPacks(ctx, instID); perr == nil {
				for _, p := range packs {
					if p.PackName == pack.StandardPackName {
						packInfo["installed"] = true
						packInfo["installed_version"] = p.PackVersion
						packInfo["installed_skills"] = p.SkillCount
						packCurrent = p.PackVersion == target
						break
					}
				}
			}
		}
		packInfo["up_to_date"] = packCurrent

		upToDate := current.pinned == target && packCurrent
		applied := false
		if argBool(req, "apply") && !upToDate {
			if svc.Schema != nil {
				if _, ierr := svc.Schema.ImportFromEmbedded(ctx, target); ierr != nil {
					return toolErr(ctx, ierr), nil
				}
			}
			if svc.Pack != nil && !packCurrent {
				if perr := svc.Pack.RefreshStandardPack(ctx, instID); perr != nil {
					return toolErr(ctx, perr), nil
				}
			}
			if current.pinned != target {
				if serr := svc.Instance.SetSchemaVersion(ctx, instID, target); serr != nil {
					return toolErr(ctx, serr), nil
				}
			}
			applied = true
		}

		hint := "nothing to do"
		switch {
		case applied:
			hint = "the instance is now on schema version " + target + "; validate_instance reads it from here"
		case !upToDate:
			hint = "nothing was changed; pass apply=true to move the instance to schema version " + target
		}
		return mustJSON(map[string]any{
			"instance_id":       instID,
			"applied":           applied,
			"up_to_date":        upToDate,
			"current_version":   current.pinned,
			"version_used":      current.used,
			"target_version":    target,
			"artifacts_checked": len(artifacts),
			"newly_valid":       newlyValid,
			"newly_invalid":     newlyInvalid,
			"unchanged_valid":   stillValid,
			"unchanged_invalid": stillInvalid,
			"standard_pack":     packInfo,
			"hint":              hint,
		})
	})
}

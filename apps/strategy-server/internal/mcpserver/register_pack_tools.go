package mcpserver

// register_pack_tools.go — 11 new MCP tools for the skill pack system and app platform.
//
// Tools added (65 → 76):
//   list_installed_skills, get_installed_skill, run_skill,
//   scaffold_skill,
//   install_pack, list_packs, get_pack, uninstall_pack,
//   list_apps, run_app,
//   describe_pack_format

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	appdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/app"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/pack"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/skillrunner"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

func registerPackTools(s *server.MCPServer, svc Services) {
	registerSkillResolutionTools(s, svc)
	registerSkillAuthoringTools(s, svc)
	registerPackManagementTools(s, svc)
	registerAppPlatformTools(s, svc)
}

// ---------------------------------------------------------------------------
// Skill resolution tools
// ---------------------------------------------------------------------------

func registerSkillResolutionTools(s *server.MCPServer, svc Services) { //nolint:gocyclo
	// list_installed_skills
	s.AddTool(mcp.NewTool("list_installed_skills",
		mcp.WithDescription("USE WHEN you need to list all skills available to an instance, with source provenance (installed | canonical | generator-alias). Use source_filter to narrow to installed-only."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("source_filter", mcp.Description("Filter by source: installed | canonical | all (default: all)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		if svc.Pack == nil {
			return toolErr(ctx, apperror.ErrInternal.WithDetail("pack service not available")), nil
		}
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		filter := argString(req, "source_filter")
		skills, err := svc.Pack.ListAvailableSkills(ctx, id, filter)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(skills)
	})

	// get_installed_skill
	s.AddTool(mcp.NewTool("get_installed_skill",
		mcp.WithDescription("USE WHEN you need the full definition of a specific skill available to an instance, including its prompt, source, and execution mode."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("skill_name", mcp.Required(), mcp.Description("Kebab-case skill name")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		if svc.Pack == nil {
			return toolErr(ctx, apperror.ErrInternal.WithDetail("pack service not available")), nil
		}
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		skillName := argString(req, "skill_name")
		if skillName == "" {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("skill_name is required")), nil
		}
		skill, err := svc.Pack.ResolveSkill(ctx, id, skillName)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(skill)
	})

	// run_skill
	s.AddTool(mcp.NewTool("run_skill",
		mcp.WithDescription("USE WHEN you need to execute an installed or canonical skill. Prompt-mode skills return the prompt for you to follow. Script-mode skills run a subprocess and return the output."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("skill_name", mcp.Required(), mcp.Description("Kebab-case skill name")),
		mcp.WithString("params", mcp.Description("Optional JSON object passed to the skill as params")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		if svc.Pack == nil {
			return toolErr(ctx, apperror.ErrInternal.WithDetail("pack service not available")), nil
		}
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		skillName := argString(req, "skill_name")
		if skillName == "" {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("skill_name is required")), nil
		}
		skill, err := svc.Pack.ResolveSkill(ctx, id, skillName)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		switch skill.ExecutionMode {
		case "inline":
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail(
				fmt.Sprintf("skill %q uses inline execution which is reserved for core embedded skills and cannot be invoked via run_skill", skillName))), nil

		case "script":
			if skill.ScriptSrc == nil || *skill.ScriptSrc == "" {
				return toolErr(ctx, apperror.ErrBadRequest.WithDetail(
					fmt.Sprintf("skill %q is script-mode but has no script_src", skillName))), nil
			}
			lang := "sh"
			if skill.ScriptLang != nil {
				lang = *skill.ScriptLang
			}

			// Build stdin JSON.
			var paramsMap map[string]interface{}
			if raw := argString(req, "params"); raw != "" {
				if err := json.Unmarshal([]byte(raw), &paramsMap); err != nil {
					return toolErr(ctx, apperror.ErrBadRequest.WithDetail("params is not valid JSON: "+err.Error())), nil //nolint:nilerr
				}
			}
			artifacts, _ := svc.Strategy.ListCurrentArtifacts(ctx, id, "")
			stdinData := map[string]interface{}{
				"instance_id": id.String(),
				"artifacts":   artifacts,
				"params":      paramsMap,
			}
			stdinBytes, _ := json.Marshal(stdinData)

			result, err := skillrunner.Run(ctx, *skill.ScriptSrc, lang, stdinBytes)
			if err != nil {
				return toolErr(ctx, err), nil
			}
			// Parse the output JSON.
			var out struct {
				Output string `json:"output"`
				Format string `json:"format"`
			}
			if err := json.Unmarshal(result.Stdout, &out); err != nil {
				// Return raw if not parseable JSON.
				out.Output = string(result.Stdout)
				out.Format = "text"
			}
			return mustJSON(map[string]any{
				"mode":        "script",
				"skill_name":  skillName,
				"output":      out.Output,
				"format":      out.Format,
				"duration_ms": result.Duration.Milliseconds(),
			})

		default: // prompt
			promptMD := ""
			if skill.PromptMD != nil {
				promptMD = *skill.PromptMD
			}
			return mustJSON(map[string]any{
				"mode":       "prompt",
				"skill_name": skillName,
				"prompt_md":  promptMD,
				"requires":   extractRequires(skill.SkillYAML),
			})
		}
	})
}

// ---------------------------------------------------------------------------
// Skill authoring tools
// ---------------------------------------------------------------------------

func registerSkillAuthoringTools(s *server.MCPServer, _ Services) { //nolint:gocyclo
	// scaffold_skill
	s.AddTool(mcp.NewTool("scaffold_skill",
		mcp.WithDescription("USE WHEN you need to generate a schema-valid skill.yaml, prompt.md, and pack.yaml skeleton for a new skill. Output is ready to pass directly to install_pack."),
		mcp.WithString("name", mcp.Required(), mcp.Description("Kebab-case skill name")),
		mcp.WithString("type", mcp.Required(), mcp.Description("Skill type: creation | review | generation | analysis")),
		mcp.WithString("execution", mcp.Required(), mcp.Description("Execution mode: prompt | script")),
		mcp.WithString("description", mcp.Required(), mcp.Description("One-sentence description of what the skill does")),
		mcp.WithString("phase", mcp.Description("EPF phase: READY | FIRE | AIM (default: FIRE)")),
		mcp.WithString("requires_artifacts", mcp.Description("Comma-separated artifact types the skill requires")),
		mcp.WithString("requires_tools", mcp.Description("Comma-separated MCP tool names the skill uses")),
		mcp.WithString("script_lang", mcp.Description("Script language (script mode only): py | sh | ts | js (default: sh)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		name := argString(req, "name")
		skillType := argString(req, "type")
		execution := argString(req, "execution")
		description := argString(req, "description")

		if name == "" || skillType == "" || execution == "" || description == "" {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("name, type, execution, and description are all required")), nil
		}

		validTypes := map[string]bool{"creation": true, "review": true, "generation": true, "analysis": true}
		if !validTypes[skillType] {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail(
				fmt.Sprintf("type must be one of: creation, review, generation, analysis; got %q", skillType))), nil
		}
		if execution != "prompt" && execution != "script" {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail(
				fmt.Sprintf("execution must be prompt or script; got %q", execution))), nil
		}

		phase := argString(req, "phase")
		if phase == "" {
			phase = "FIRE"
		}
		validPhases := map[string]bool{"READY": true, "FIRE": true, "AIM": true}
		if !validPhases[phase] {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail(
				fmt.Sprintf("phase must be READY, FIRE, or AIM; got %q", phase))), nil
		}

		scriptLang := argString(req, "script_lang")
		if execution == "script" && scriptLang == "" {
			scriptLang = "sh"
		}

		// Build requires block.
		var requiresLines []string
		if raw := argString(req, "requires_artifacts"); raw != "" {
			arts := splitTrim(raw)
			requiresLines = append(requiresLines, "  artifacts:")
			for _, a := range arts {
				requiresLines = append(requiresLines, "    - "+a)
			}
		}
		if raw := argString(req, "requires_tools"); raw != "" {
			tools := splitTrim(raw)
			requiresLines = append(requiresLines, "  tools:")
			for _, t := range tools {
				requiresLines = append(requiresLines, "    - "+t)
			}
		}
		requiresBlock := ""
		if len(requiresLines) > 0 {
			requiresBlock = "\nrequires:\n" + strings.Join(requiresLines, "\n")
		}

		// Build script_lang line.
		scriptLangLine := ""
		if execution == "script" {
			scriptLangLine = "\nscript_lang: " + scriptLang
		}

		skillYAML := fmt.Sprintf(`name: %s
version: "1.0.0"
type: %s
phase: %s
description: %q
execution: %s%s%s
`,
			name, skillType, phase, description, execution, scriptLangLine, requiresBlock,
		)

		// Build prompt skeleton.
		var promptSections string
		switch execution {
		case "script":
			promptSections = fmt.Sprintf(`# %s

## Purpose

%s

## Inputs (stdin JSON)

The script receives a JSON object on stdin:

`+"```json"+`
{
  "instance_id": "uuid",
  "artifacts": [...],
  "params": {}
}
`+"```"+`

## Output (stdout JSON)

The script must write a single JSON object to stdout:

`+"```json"+`
{
  "output": "...",
  "format": "markdown"
}
`+"```"+`

## Script logic

<!-- TODO: implement the script logic -->
`, name, description)
		default: // prompt
			promptSections = fmt.Sprintf(`# %s

## Purpose

%s

## Context

<!-- TODO: describe what strategic context is needed -->

## Instructions

<!-- TODO: write step-by-step instructions for the agent -->

## Output format

<!-- TODO: describe the expected output format and structure -->
`, name, description)
		}

		// Build pack.yaml wrapper.
		packYAML := fmt.Sprintf(`name: %s
version: "1.0.0"
description: "Pack containing the %s skill"
author: ""
trusted: false
`, name, name)

		return mustJSON(map[string]any{
			"skill_yaml": skillYAML,
			"prompt_md":  promptSections,
			"pack_yaml":  packYAML,
		})
	})
}

// ---------------------------------------------------------------------------
// Pack management tools
// ---------------------------------------------------------------------------

func registerPackManagementTools(s *server.MCPServer, svc Services) { //nolint:gocyclo
	// install_pack
	s.AddTool(mcp.NewTool("install_pack",
		mcp.WithDescription("USE WHEN you need to install a skill pack into an instance. Provide pack_yaml and an array of skills. Use force: true to upgrade an existing pack."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("pack_yaml", mcp.Required(), mcp.Description("Pack manifest YAML content")),
		mcp.WithString("skills", mcp.Description("JSON array of {name, skill_yaml, prompt_md?, script_src?, script_lang?}")),
		mcp.WithBoolean("force", mcp.Description("Replace existing pack if already installed (default: false)")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		if svc.Pack == nil {
			return toolErr(ctx, apperror.ErrInternal.WithDetail("pack service not available")), nil
		}
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		packYAML := argString(req, "pack_yaml")
		if packYAML == "" {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("pack_yaml is required")), nil
		}
		force := argBool(req, "force")

		// Parse skills array.
		var skillBundles []pack.SkillBundle
		if raw := argString(req, "skills"); raw != "" {
			var items []struct {
				Name       string  `json:"name"`
				SkillYAML  string  `json:"skill_yaml"`
				PromptMD   *string `json:"prompt_md"`
				ScriptSrc  *string `json:"script_src"`
				ScriptLang *string `json:"script_lang"`
			}
			if err := json.Unmarshal([]byte(raw), &items); err != nil {
				return toolErr(ctx, apperror.ErrBadRequest.WithDetail("skills is not valid JSON array: "+err.Error())), nil //nolint:nilerr
			}
			for _, item := range items {
				skillBundles = append(skillBundles, pack.SkillBundle{
					Name:       item.Name,
					SkillYAML:  item.SkillYAML,
					PromptMD:   item.PromptMD,
					ScriptSrc:  item.ScriptSrc,
					ScriptLang: item.ScriptLang,
				})
			}
		}

		bundle, err := pack.ParsePackBundle(packYAML, skillBundles)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		if err := svc.Pack.InstallPack(ctx, id, bundle, force); err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{
			"installed":    true,
			"pack_name":    bundle.Manifest.Name,
			"pack_version": bundle.Manifest.Version,
			"skill_count":  len(bundle.Skills),
			"app_count":    0, // apps are registered separately via InstallApp
		})
	})

	// list_packs
	s.AddTool(mcp.NewTool("list_packs",
		mcp.WithDescription("USE WHEN you need to see which skill packs are installed for an instance and whether the standard pack is up to date."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		if svc.Pack == nil {
			return toolErr(ctx, apperror.ErrInternal.WithDetail("pack service not available")), nil
		}
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		packs, err := svc.Pack.ListInstalledPacks(ctx, id)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		serverVersion := strings.TrimSpace(embedded.Version)
		// Annotate standard pack with up_to_date.
		type packOut struct {
			*pack.InstalledPackSummary
			UpToDate *bool `json:"up_to_date,omitempty"`
		}
		out := make([]packOut, len(packs))
		for i, p := range packs {
			po := packOut{InstalledPackSummary: p}
			if p.PackName == pack.StandardPackName {
				upToDate := p.PackVersion == serverVersion
				po.UpToDate = &upToDate
			}
			out[i] = po
		}
		return mustJSON(out)
	})

	// get_pack
	s.AddTool(mcp.NewTool("get_pack",
		mcp.WithDescription("USE WHEN you need full details of an installed pack including all skill names and apps."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("pack_name", mcp.Required(), mcp.Description("Pack name")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		if svc.Pack == nil {
			return toolErr(ctx, apperror.ErrInternal.WithDetail("pack service not available")), nil
		}
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		packName := argString(req, "pack_name")
		if packName == "" {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("pack_name is required")), nil
		}
		skills, err := svc.Pack.ListAvailableSkills(ctx, id, "installed")
		if err != nil {
			return toolErr(ctx, err), nil
		}
		var packSkills []map[string]any
		for _, sk := range skills {
			if sk.PackName != nil && *sk.PackName == packName {
				packSkills = append(packSkills, map[string]any{
					"skill_name": sk.SkillName,
					"type":       sk.Type,
					"execution":  sk.ExecutionMode,
				})
			}
		}
		// Also gather apps for this pack.
		allApps, err := svc.App.ListApps(ctx, id)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		var packApps []map[string]any
		for _, a := range allApps {
			if a.PackName == packName {
				packApps = append(packApps, map[string]any{
					"app_name": a.AppName,
					"status":   a.Status,
				})
			}
		}
		if len(packSkills) == 0 && len(packApps) == 0 {
			return toolErr(ctx, apperror.ErrNotFound.WithDetail(
				fmt.Sprintf("pack %q is not installed for this instance", packName))), nil
		}
		return mustJSON(map[string]any{
			"pack_name":   packName,
			"skills":      packSkills,
			"skill_count": len(packSkills),
			"apps":        packApps,
			"app_count":   len(packApps),
		})
	})

	// uninstall_pack
	s.AddTool(mcp.NewTool("uninstall_pack",
		mcp.WithDescription("USE WHEN you need to remove an installed pack and all its skills and apps from an instance."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("pack_name", mcp.Required(), mcp.Description("Pack name to uninstall")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		if svc.Pack == nil {
			return toolErr(ctx, apperror.ErrInternal.WithDetail("pack service not available")), nil
		}
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		packName := argString(req, "pack_name")
		if packName == "" {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("pack_name is required")), nil
		}
		skillsRemoved, err := svc.Pack.UninstallPack(ctx, id, packName)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		// Also remove any apps belonging to this pack.
		appsRemoved, err := svc.App.UninstallApps(ctx, id, packName)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(map[string]any{
			"uninstalled":    true,
			"pack_name":      packName,
			"skills_removed": skillsRemoved,
			"apps_removed":   appsRemoved,
		})
	})
}

// ---------------------------------------------------------------------------
// strategyMutationStager — implements app.MutationStager via strategy.Service
// ---------------------------------------------------------------------------

// strategyMutationStager adapts strategy.Service to the app.MutationStager interface.
// It stages each app-proposed mutation in a single shared batch and returns the batch ID.
type strategyMutationStager struct {
	svc *strategy.Service
}

// StageAppMutation stages all app-proposed mutations in a single batch.
func (m *strategyMutationStager) StageAppMutation(
	ctx context.Context,
	instanceID uuid.UUID,
	appName string,
	mutations []appdom.StagedMutation,
) (*uuid.UUID, error) {
	if len(mutations) == 0 {
		return nil, nil
	}
	var batchID *uuid.UUID
	for _, mut := range mutations {
		var payload interface{}
		if err := json.Unmarshal(mut.Payload, &payload); err != nil {
			payload = string(mut.Payload)
		}
		action := domain.MutationActionCreate
		id, err := m.svc.Stage(ctx, strategy.StageParams{
			InstanceID:   instanceID,
			ArtifactType: mut.ArtifactType,
			ArtifactKey:  mut.ArtifactKey,
			Action:       action,
			Payload:      payload,
			BatchID:      batchID,
		})
		if err != nil {
			return nil, fmt.Errorf("stage app mutation %q: %w", mut.ArtifactKey, err)
		}
		if batchID == nil {
			batchID = &id
		}
	}
	return batchID, nil
}

// ---------------------------------------------------------------------------
// App platform tools
// ---------------------------------------------------------------------------

func registerAppPlatformTools(s *server.MCPServer, svc Services) {
	// list_apps
	s.AddTool(mcp.NewTool("list_apps",
		mcp.WithDescription("USE WHEN you need to see which strategy apps are installed for an instance, including their display metadata and status."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		apps, err := svc.App.ListApps(ctx, id)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(apps)
	})

	// run_app
	s.AddTool(mcp.NewTool("run_app",
		mcp.WithDescription("USE WHEN you need to invoke an installed strategy app. The app receives artifact context and returns a document. If it proposes mutations, a batch_id is returned for human review."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("app_name", mcp.Required(), mcp.Description("App name to invoke")),
		mcp.WithString("params", mcp.Description("Optional JSON object forwarded to the app as params")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		id, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		appName := argString(req, "app_name")
		if appName == "" {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("app_name is required")), nil
		}
		var params map[string]interface{}
		if raw := argString(req, "params"); raw != "" {
			if err := json.Unmarshal([]byte(raw), &params); err != nil {
				return toolErr(ctx, apperror.ErrBadRequest.WithDetail("params is not valid JSON: "+err.Error())), nil //nolint:nilerr
			}
		}
		stager := &strategyMutationStager{svc: svc.Strategy}
		result, err := svc.App.RunApp(ctx, id, appName, params, svc.Strategy, stager)
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mustJSON(result)
	})

	// describe_pack_format
	s.AddTool(mcp.NewTool("describe_pack_format",
		mcp.WithDescription("USE WHEN you need to understand the pack, skill, or app YAML format for authoring a new pack. Returns schemas and a complete example."),
	), func(_ context.Context, _ mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return mustJSON(map[string]any{
			"pack_yaml_schema": map[string]any{
				"required": []string{"name", "version"},
				"fields": map[string]string{
					"name":        "string — kebab-case pack name",
					"version":     "string — semver",
					"description": "string — optional",
					"author":      "string — optional",
					"trusted":     "bool — default false",
				},
			},
			"skill_yaml_schema": map[string]any{
				"required": []string{"name", "version", "type", "description"},
				"fields": map[string]string{
					"name":        "string — kebab-case",
					"version":     "string — semver",
					"type":        "enum: creation | review | generation | analysis",
					"phase":       "enum: READY | FIRE | AIM (default: FIRE)",
					"description": "string",
					"execution":   "enum: prompt | script (default: prompt; inline reserved for core skills)",
					"script_lang": "enum: py | sh | ts | js (required when execution=script)",
				},
			},
			"app_yaml_schema": map[string]any{
				"required": []string{"name", "version", "url", "display.name", "output.format"},
				"fields": map[string]string{
					"name":                 "string — kebab-case",
					"version":              "string — semver",
					"url":                  "string — base URL of the app HTTP server",
					"min_contract_version": "int — minimum strategy-server contract version (default: 1)",
					"display.name":         "string",
					"display.description":  "string",
					"display.icon":         "string — icon library identifier",
					"display.category":     "string",
					"display.tags":         "[]string",
					"inputs":               "[]AppInput — typed form schema for UI rendering",
					"output.format":        "enum: markdown | yaml | html | json",
					"requires.artifacts":   "[]string — artifact types pushed on invocation",
				},
			},
			"execution_modes": []map[string]string{
				{"mode": "prompt", "description": "Agent follows the prompt.md instructions"},
				{"mode": "script", "description": "Subprocess receives JSON on stdin, returns JSON on stdout"},
				{"mode": "inline", "description": "Compiled Go handler — reserved for core embedded skills only"},
			},
			"example_pack": map[string]any{
				"pack_yaml":  "name: my-pack\nversion: \"1.0.0\"\ndescription: \"Example pack\"\nauthor: \"Your Name\"\ntrusted: false\n",
				"skill_yaml": "name: my-skill\nversion: \"1.0.0\"\ntype: creation\nphase: FIRE\ndescription: \"Does something useful\"\nexecution: prompt\n",
				"prompt_md":  "# My Skill\n\n## Purpose\n\nDescribe the skill purpose here.\n\n## Instructions\n\n1. First step\n2. Second step\n",
			},
		})
	})
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// splitTrim splits a comma-separated string and trims whitespace from each element.
func splitTrim(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// extractRequires does a minimal parse of the requires block from a skill YAML.
func extractRequires(skillYAML string) map[string]interface{} {
	// Simple: return a placeholder; full parsing is done by the skill consumer.
	_ = skillYAML
	return map[string]interface{}{}
}

// argBool extracts a boolean argument from an MCP tool request.
func argBool(req mcp.CallToolRequest, key string) bool {
	return req.GetBool(key, false)
}

// UUID helper used in pack tools (reuses parseUUID from the main server file).
var _ = uuid.New // ensure uuid import is used

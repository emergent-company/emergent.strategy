package mcp

import (
	"context"
	"fmt"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/agent"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/anchor"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/skill"
	"github.com/mark3labs/mcp-go/mcp"
)

// =============================================================================
// MCP Resources: Skills as strategy://skills/{name}
// =============================================================================

const (
	// skillResourceURIPrefix is the URI prefix for skill resources.
	skillResourceURIPrefix = "strategy://skills/"

	// skillResourceTemplate is the RFC 6570 URI template for skills.
	skillResourceTemplate = "strategy://skills/{name}"
)

// registerSkillResources registers skills as MCP Resources.
//
// Per the spec: list_resources() returns one entry per skill with name and
// description only (lazy-loading). read_resource() returns the full prompt
// content when the host requests a specific skill URI.
//
// We register a ResourceTemplate so hosts can discover the URI pattern,
// plus individual Resource entries for each currently loaded skill.
func (s *Server) registerSkillResources() {
	if s.skillLoader == nil || !s.skillLoader.HasSkills() {
		return
	}

	// Register the URI template for dynamic resolution
	s.mcpServer.AddResourceTemplate(
		mcp.NewResourceTemplate(
			skillResourceTemplate,
			"EPF Skill",
			mcp.WithTemplateDescription("Access EPF skill prompt content by name. "+
				"Skills are bundled capabilities with prompts, prerequisites, and validation."),
			mcp.WithTemplateMIMEType("text/markdown"),
		),
		s.handleReadSkillResource,
	)

	// Register individual resources for each loaded skill (for list_resources)
	skills := s.skillLoader.ListSkills(nil, nil, nil)
	for _, sk := range skills {
		uri := skillResourceURIPrefix + sk.Name
		desc := sk.Description
		if desc == "" {
			desc = fmt.Sprintf("EPF skill: %s (%s)", sk.Name, sk.Type)
		}

		s.mcpServer.AddResource(
			mcp.NewResource(
				uri,
				sk.Name,
				mcp.WithResourceDescription(desc),
				mcp.WithMIMEType("text/markdown"),
			),
			s.handleReadSkillResource,
		)
	}
}

// handleReadSkillResource handles read_resource requests for strategy://skills/{name}.
func (s *Server) handleReadSkillResource(ctx context.Context, request mcp.ReadResourceRequest) ([]mcp.ResourceContents, error) {
	uri := request.Params.URI

	// Extract skill name from URI
	name := strings.TrimPrefix(uri, skillResourceURIPrefix)
	if name == "" || name == uri {
		return nil, fmt.Errorf("invalid skill URI: %s (expected strategy://skills/{name})", uri)
	}

	if s.skillLoader == nil || !s.skillLoader.HasSkills() {
		return nil, fmt.Errorf("skills not loaded")
	}

	// Get full skill content
	content, err := s.skillLoader.GetSkillContent(name)
	if err != nil {
		return nil, fmt.Errorf("skill not found: %s", name)
	}

	// Build the response text: manifest metadata as YAML frontmatter + prompt content
	var sb strings.Builder

	// Include manifest metadata as frontmatter if available
	if content.ManifestContent != "" {
		sb.WriteString("---\n")
		sb.WriteString(content.ManifestContent)
		if !strings.HasSuffix(content.ManifestContent, "\n") {
			sb.WriteString("\n")
		}
		sb.WriteString("---\n\n")
	}

	// Include prompt content
	if content.PromptContent != "" {
		sb.WriteString(content.PromptContent)
	} else {
		sb.WriteString(fmt.Sprintf("# %s\n\nNo prompt content available for this skill.\n", name))
	}

	return []mcp.ResourceContents{
		mcp.TextResourceContents{
			URI:      uri,
			MIMEType: "text/markdown",
			Text:     sb.String(),
		},
	}, nil
}

// =============================================================================
// MCP Prompts: Agents as persona templates
// =============================================================================

// registerAgentPrompts registers agents as MCP Prompts.
//
// Per the spec: list_prompts() returns one entry per agent. get_prompt()
// returns the agent's system prompt with optional context injection from
// the EPF instance.
func (s *Server) registerAgentPrompts() {
	if s.agentLoader == nil || !s.agentLoader.HasAgents() {
		return
	}

	agents := s.agentLoader.ListAgents(nil, nil)
	for _, a := range agents {
		desc := a.Description
		if desc == "" {
			desc = fmt.Sprintf("EPF %s agent: %s", a.Type, a.DisplayName)
		}

		prompt := mcp.NewPrompt(
			a.Name,
			mcp.WithPromptDescription(desc),
			mcp.WithArgument("instance_path",
				mcp.ArgumentDescription("Optional EPF instance path for context injection"),
			),
		)

		s.mcpServer.AddPrompt(prompt, s.handleGetAgentPrompt)
	}
}

// handleGetAgentPrompt handles get_prompt requests for agent prompts.
func (s *Server) handleGetAgentPrompt(ctx context.Context, request mcp.GetPromptRequest) (*mcp.GetPromptResult, error) {
	name := request.Params.Name

	if s.agentLoader == nil || !s.agentLoader.HasAgents() {
		return nil, fmt.Errorf("agents not loaded")
	}

	a, err := s.agentLoader.GetAgentWithContent(name)
	if err != nil {
		return nil, fmt.Errorf("agent not found: %s", name)
	}

	// Build the system prompt
	var sb strings.Builder

	// Start with the agent's prompt content
	if a.Content != "" {
		sb.WriteString(a.Content)
	} else {
		sb.WriteString(fmt.Sprintf("You are %s, %s.\n", a.DisplayName, a.Description))
	}

	// Inject instance context if an instance_path was provided
	instancePath := ""
	if request.Params.Arguments != nil {
		instancePath = request.Params.Arguments["instance_path"]
	}
	if instancePath == "" {
		instancePath = s.defaultInstancePath
	}

	if instancePath != "" {
		contextBlock := buildInstanceContext(instancePath)
		if contextBlock != "" {
			sb.WriteString("\n\n---\n\n## EPF Instance Context\n\n")
			sb.WriteString(contextBlock)
		}
	}

	description := a.Description
	if description == "" {
		description = fmt.Sprintf("EPF %s agent", a.Type)
	}

	return &mcp.GetPromptResult{
		Description: description,
		Messages: []mcp.PromptMessage{
			{
				Role:    mcp.RoleUser,
				Content: mcp.NewTextContent(sb.String()),
			},
		},
	}, nil
}

// buildInstanceContext builds a contextual block from an EPF instance for
// injection into agent prompts. Returns empty string if no useful context
// can be extracted.
func buildInstanceContext(instancePath string) string {
	var parts []string

	// Try to load anchor for product name
	if anchor.Exists(instancePath) {
		a, err := anchor.Load(instancePath)
		if err == nil {
			if a.ProductName != "" {
				parts = append(parts, fmt.Sprintf("- **Product**: %s", a.ProductName))
			}
			if a.Description != "" {
				parts = append(parts, fmt.Sprintf("- **Description**: %s", a.Description))
			}
			if a.EPFVersion != "" {
				parts = append(parts, fmt.Sprintf("- **EPF Version**: %s", a.EPFVersion))
			}
		}
	}

	parts = append(parts, fmt.Sprintf("- **Instance Path**: `%s`", instancePath))

	if len(parts) == 0 {
		return ""
	}

	return strings.Join(parts, "\n")
}

// =============================================================================
// Registration entrypoint
// =============================================================================

// registerPrimitives registers MCP Resources and Prompts.
// Called after loaders are initialized in NewServer.
func (s *Server) registerPrimitives() {
	s.registerSkillResources()
	s.registerAgentPrompts()
}

// refreshPrimitives re-registers MCP Resources and Prompts after loaders change.
// This should be called when instance-specific skills/agents are loaded.
func (s *Server) refreshPrimitives() {
	// Skills: clear and re-register
	if s.skillLoader != nil && s.skillLoader.HasSkills() {
		// Remove old skill resources first
		skills := s.skillLoader.ListSkills(nil, nil, nil)
		for _, sk := range skills {
			uri := skillResourceURIPrefix + sk.Name
			s.mcpServer.RemoveResource(uri)
		}
	}

	// Agents: clear and re-register prompts
	if s.agentLoader != nil && s.agentLoader.HasAgents() {
		agents := s.agentLoader.ListAgents(nil, nil)
		for _, a := range agents {
			s.mcpServer.DeletePrompts(a.Name)
		}
	}

	// Re-register
	s.registerSkillResources()
	s.registerAgentPrompts()
}

// Ensure the server types are used so imports aren't flagged.
var _ = (*agent.Loader)(nil)
var _ = (*skill.Loader)(nil)

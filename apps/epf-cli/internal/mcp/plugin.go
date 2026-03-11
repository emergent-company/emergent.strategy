package mcp

import (
	"os"
	"strings"
)

// PluginInfo holds information about the orchestration plugin status.
type PluginInfo struct {
	// Detected is true if an orchestration plugin is active.
	Detected bool `json:"plugin_detected"`
	// PluginName is the name of the detected plugin (e.g., "opencode-epf").
	PluginName string `json:"plugin_name,omitempty"`
	// PluginVersion is the version of the detected plugin.
	PluginVersion string `json:"plugin_version,omitempty"`
	// StandaloneMode is true when no plugin is detected.
	StandaloneMode bool `json:"standalone_mode"`
	// HostName is the detected MCP host name (e.g., "opencode", "cursor").
	HostName string `json:"host_name,omitempty"`
	// AvailablePlugin is the name of a known plugin for the detected host.
	AvailablePlugin string `json:"available_plugin,omitempty"`
	// InstallHint tells the user how to install the plugin for their host.
	InstallHint string `json:"install_hint,omitempty"`
	// WhatYouGain lists benefits of installing the plugin.
	WhatYouGain []string `json:"what_you_gain,omitempty"`
	// StandaloneProtocols lists self-enforcement protocols for standalone mode.
	StandaloneProtocols []string `json:"standalone_protocols,omitempty"`
	// ActiveGuardrails lists guardrails when plugin is active.
	ActiveGuardrails []string `json:"active_guardrails,omitempty"`
}

// knownHost maps a host name to its available plugin and install hint.
type knownHost struct {
	PluginName  string
	InstallHint string
	Available   bool // Whether the plugin actually exists yet
}

// hostRegistry maps MCP client names to known hosts with plugin information.
var hostRegistry = map[string]knownHost{
	"opencode": {
		PluginName:  "opencode-epf",
		InstallHint: `Add "opencode-epf" to the "plugin" array in opencode.jsonc`,
		Available:   true,
	},
	"cursor": {
		PluginName:  "cursor-epf",
		InstallHint: "Not yet available. Check EPF docs for updates.",
		Available:   false,
	},
	"claude-desktop": {
		PluginName:  "claude-desktop-epf",
		InstallHint: "Not yet available. Check EPF docs for updates.",
		Available:   false,
	},
}

// pluginBenefits lists what the orchestration plugin adds.
var pluginBenefits = []string{
	"Automatic validation after every file write",
	"Commit guard that blocks git commit when EPF instance has critical errors",
	"Proactive health check on session idle",
	"Agent persona injection into system prompt",
	"Tool scoping based on active skill",
}

// standaloneProtocols lists self-enforcement protocols for standalone mode.
var standaloneProtocols = []string{
	"You MUST call epf_validate_file after writing or modifying any EPF YAML file",
	"You MUST call epf_health_check at the start of each session before other work",
	"You MUST validate the EPF instance before any git commit",
	"When a skill response includes PREFERRED TOOLS, prioritize those tools",
}

// activeGuardrails lists what the plugin enforces mechanically.
var activeGuardrails = []string{
	"Automatic file validation on save",
	"Commit guard active",
	"Session idle health check active",
	"Agent persona injection via system prompt",
	"Tool scoping based on active skill",
}

// envPluginActive is the environment variable that orchestration plugins set.
const envPluginActive = "EPF_PLUGIN_ACTIVE"

// DetectPlugin checks for an active orchestration plugin.
// It reads EPF_PLUGIN_ACTIVE env var first, then falls back to host detection.
func DetectPlugin(hostName string) *PluginInfo {
	info := &PluginInfo{}

	// Priority 1: Environment variable (most reliable)
	if envVal := os.Getenv(envPluginActive); envVal != "" {
		info.Detected = true
		info.StandaloneMode = false
		info.ActiveGuardrails = activeGuardrails

		// Parse "plugin-name@version" format
		parts := strings.SplitN(envVal, "@", 2)
		info.PluginName = parts[0]
		if len(parts) > 1 {
			info.PluginVersion = parts[1]
		}

		return info
	}

	// Priority 2: Host detection from MCP client name
	info.StandaloneMode = true
	info.StandaloneProtocols = standaloneProtocols

	if hostName != "" {
		info.HostName = hostName
		normalizedHost := strings.ToLower(hostName)

		if host, ok := hostRegistry[normalizedHost]; ok {
			if host.Available {
				info.AvailablePlugin = host.PluginName
				info.InstallHint = host.InstallHint
				info.WhatYouGain = pluginBenefits
			}
		}
	}

	return info
}

// StandalonePromptSuffix returns the text to append to agent prompts
// when running in standalone mode (no orchestration plugin).
func StandalonePromptSuffix(preferredTools, avoidTools []string) string {
	var sb strings.Builder
	sb.WriteString("\n---\n")
	sb.WriteString("## Standalone Mode Protocols\n\n")
	sb.WriteString("You are running without an orchestration plugin. The following protocols\n")
	sb.WriteString("are your responsibility to enforce manually:\n\n")

	sb.WriteString("### Validation Protocol\n")
	sb.WriteString("After writing or modifying ANY EPF YAML file, you MUST immediately call\n")
	sb.WriteString("`epf_validate_file` on that file. Do not batch validations. Do not skip\n")
	sb.WriteString("this step. This is normally handled automatically by the plugin.\n\n")

	sb.WriteString("### Pre-Commit Protocol\n")
	sb.WriteString("Before executing any `git commit` command, you MUST call `epf_health_check`\n")
	sb.WriteString("on the EPF instance. If critical errors are found, fix them before committing.\n")
	sb.WriteString("This is normally enforced by the plugin's commit guard.\n\n")

	if len(preferredTools) > 0 || len(avoidTools) > 0 {
		sb.WriteString("### Tool Scope\n")
		if len(preferredTools) > 0 {
			sb.WriteString("This agent works best with these tools: ")
			sb.WriteString(strings.Join(preferredTools, ", "))
			sb.WriteString("\n")
		}
		if len(avoidTools) > 0 {
			sb.WriteString("Avoid calling these tools during this workflow: ")
			sb.WriteString(strings.Join(avoidTools, ", "))
			sb.WriteString("\n")
		}
		sb.WriteString("This is normally enforced by the plugin's tool scoping.\n")
	}

	sb.WriteString("---\n")
	return sb.String()
}

// FormatSkillScope returns a text block describing preferred and avoided tools
// for inclusion in standalone-mode skill responses.
func FormatSkillScope(preferredTools, avoidTools []string) string {
	if len(preferredTools) == 0 && len(avoidTools) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString("\n## Tool Scope (Standalone Mode)\n\n")

	if len(preferredTools) > 0 {
		sb.WriteString("**PREFERRED TOOLS** — prioritize these during this skill:\n")
		for _, tool := range preferredTools {
			sb.WriteString("- `")
			sb.WriteString(tool)
			sb.WriteString("`\n")
		}
		sb.WriteString("\n")
	}

	if len(avoidTools) > 0 {
		sb.WriteString("**AVOID TOOLS** — do not use these during this skill:\n")
		for _, tool := range avoidTools {
			sb.WriteString("- `")
			sb.WriteString(tool)
			sb.WriteString("`\n")
		}
		sb.WriteString("\n")
	}

	return sb.String()
}

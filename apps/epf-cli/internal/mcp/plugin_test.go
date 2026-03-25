package mcp

import (
	"os"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/auth"
)

// =============================================================================
// Task 6.7: Plugin detection tests
// =============================================================================

func TestDetectPlugin_EnvVarSet(t *testing.T) {
	// When EPF_PLUGIN_ACTIVE is set, plugin is detected
	os.Setenv(envPluginActive, "opencode-epf@1.2.0")
	defer os.Unsetenv(envPluginActive)

	info := DetectPlugin("")

	if !info.Detected {
		t.Error("Expected Detected=true when env var is set")
	}
	if info.StandaloneMode {
		t.Error("Expected StandaloneMode=false when plugin is detected")
	}
	if info.PluginName != "opencode-epf" {
		t.Errorf("Expected PluginName='opencode-epf', got '%s'", info.PluginName)
	}
	if info.PluginVersion != "1.2.0" {
		t.Errorf("Expected PluginVersion='1.2.0', got '%s'", info.PluginVersion)
	}
	if len(info.ActiveGuardrails) == 0 {
		t.Error("Expected ActiveGuardrails to be populated when plugin is detected")
	}
	if len(info.StandaloneProtocols) > 0 {
		t.Error("Expected StandaloneProtocols to be empty when plugin is detected")
	}
}

func TestDetectPlugin_EnvVarWithoutVersion(t *testing.T) {
	os.Setenv(envPluginActive, "opencode-epf")
	defer os.Unsetenv(envPluginActive)

	info := DetectPlugin("")

	if !info.Detected {
		t.Error("Expected Detected=true")
	}
	if info.PluginName != "opencode-epf" {
		t.Errorf("Expected PluginName='opencode-epf', got '%s'", info.PluginName)
	}
	if info.PluginVersion != "" {
		t.Errorf("Expected PluginVersion='', got '%s'", info.PluginVersion)
	}
}

func TestDetectPlugin_NoEnvVar_NoHost(t *testing.T) {
	// Ensure env var is not set
	os.Unsetenv(envPluginActive)

	info := DetectPlugin("")

	if info.Detected {
		t.Error("Expected Detected=false when no env var and no host")
	}
	if !info.StandaloneMode {
		t.Error("Expected StandaloneMode=true")
	}
	if len(info.StandaloneProtocols) == 0 {
		t.Error("Expected StandaloneProtocols to be populated")
	}
	if info.AvailablePlugin != "" {
		t.Errorf("Expected no AvailablePlugin without host, got '%s'", info.AvailablePlugin)
	}
}

func TestDetectPlugin_NoEnvVar_KnownHost(t *testing.T) {
	os.Unsetenv(envPluginActive)

	info := DetectPlugin("opencode")

	if info.Detected {
		t.Error("Expected Detected=false (no env var)")
	}
	if !info.StandaloneMode {
		t.Error("Expected StandaloneMode=true")
	}
	if info.HostName != "opencode" {
		t.Errorf("Expected HostName='opencode', got '%s'", info.HostName)
	}
	if info.AvailablePlugin != "opencode-epf" {
		t.Errorf("Expected AvailablePlugin='opencode-epf', got '%s'", info.AvailablePlugin)
	}
	if info.InstallHint == "" {
		t.Error("Expected InstallHint to be populated for known host")
	}
	if len(info.WhatYouGain) == 0 {
		t.Error("Expected WhatYouGain to be populated for known host with available plugin")
	}
}

func TestDetectPlugin_NoEnvVar_KnownHostCaseInsensitive(t *testing.T) {
	os.Unsetenv(envPluginActive)

	info := DetectPlugin("OpenCode")

	if info.AvailablePlugin != "opencode-epf" {
		t.Errorf("Expected case-insensitive host matching, got AvailablePlugin='%s'", info.AvailablePlugin)
	}
}

func TestDetectPlugin_NoEnvVar_KnownHostNoPlugin(t *testing.T) {
	os.Unsetenv(envPluginActive)

	info := DetectPlugin("cursor")

	if info.Detected {
		t.Error("Expected Detected=false")
	}
	if !info.StandaloneMode {
		t.Error("Expected StandaloneMode=true")
	}
	// cursor has Available: false, so no plugin advisory
	if info.AvailablePlugin != "" {
		t.Errorf("Expected no AvailablePlugin for cursor (not yet available), got '%s'", info.AvailablePlugin)
	}
}

func TestDetectPlugin_NoEnvVar_UnknownHost(t *testing.T) {
	os.Unsetenv(envPluginActive)

	info := DetectPlugin("windsurf")

	if info.Detected {
		t.Error("Expected Detected=false")
	}
	if !info.StandaloneMode {
		t.Error("Expected StandaloneMode=true")
	}
	if info.HostName != "windsurf" {
		t.Errorf("Expected HostName='windsurf', got '%s'", info.HostName)
	}
	if info.AvailablePlugin != "" {
		t.Errorf("Expected no AvailablePlugin for unknown host, got '%s'", info.AvailablePlugin)
	}
}

func TestDetectPlugin_EnvVarTakesPriority(t *testing.T) {
	// Even with a known host, env var detection takes priority
	os.Setenv(envPluginActive, "custom-plugin@0.1.0")
	defer os.Unsetenv(envPluginActive)

	info := DetectPlugin("opencode")

	if !info.Detected {
		t.Error("Expected Detected=true from env var")
	}
	if info.StandaloneMode {
		t.Error("Expected StandaloneMode=false")
	}
	if info.PluginName != "custom-plugin" {
		t.Errorf("Expected PluginName='custom-plugin', got '%s'", info.PluginName)
	}
	// Env var should take priority; host-specific fields should not be set
	if info.AvailablePlugin != "" {
		t.Error("Expected AvailablePlugin to be empty when env var is set")
	}
}

// =============================================================================
// Task 6.8: Standalone prompt adaptation tests
// =============================================================================

func TestStandalonePromptSuffix_Basic(t *testing.T) {
	suffix := StandalonePromptSuffix(nil, nil)

	if !strings.Contains(suffix, "Standalone Mode Protocols") {
		t.Error("Expected standalone mode header in suffix")
	}
	if !strings.Contains(suffix, "Validation Protocol") {
		t.Error("Expected Validation Protocol section")
	}
	if !strings.Contains(suffix, "Pre-Commit Protocol") {
		t.Error("Expected Pre-Commit Protocol section")
	}
	if !strings.Contains(suffix, "epf_validate_file") {
		t.Error("Expected epf_validate_file mentioned in validation protocol")
	}
	if !strings.Contains(suffix, "epf_health_check") {
		t.Error("Expected epf_health_check mentioned in pre-commit protocol")
	}
}

func TestStandalonePromptSuffix_WithToolScope(t *testing.T) {
	preferred := []string{"epf_validate_file", "epf_get_template"}
	avoid := []string{"epf_scaffold_generator"}

	suffix := StandalonePromptSuffix(preferred, avoid)

	if !strings.Contains(suffix, "Tool Scope") {
		t.Error("Expected Tool Scope section when tools are provided")
	}
	if !strings.Contains(suffix, "epf_validate_file, epf_get_template") {
		t.Error("Expected preferred tools listed")
	}
	if !strings.Contains(suffix, "epf_scaffold_generator") {
		t.Error("Expected avoid tools listed")
	}
}

func TestStandalonePromptSuffix_WithOnlyPreferred(t *testing.T) {
	preferred := []string{"epf_validate_file"}

	suffix := StandalonePromptSuffix(preferred, nil)

	if !strings.Contains(suffix, "Tool Scope") {
		t.Error("Expected Tool Scope section")
	}
	if !strings.Contains(suffix, "epf_validate_file") {
		t.Error("Expected preferred tools listed")
	}
	if strings.Contains(suffix, "Avoid calling") {
		t.Error("Did not expect avoid section when no avoid tools")
	}
}

func TestStandalonePromptSuffix_NoToolScope(t *testing.T) {
	suffix := StandalonePromptSuffix(nil, nil)

	if strings.Contains(suffix, "Tool Scope") {
		t.Error("Expected no Tool Scope section when no tools provided")
	}
}

func TestFormatSkillScope_Empty(t *testing.T) {
	result := FormatSkillScope(nil, nil)
	if result != "" {
		t.Errorf("Expected empty string for no tools, got '%s'", result)
	}
}

func TestFormatSkillScope_PreferredOnly(t *testing.T) {
	result := FormatSkillScope([]string{"epf_validate_file"}, nil)

	if !strings.Contains(result, "PREFERRED TOOLS") {
		t.Error("Expected PREFERRED TOOLS header")
	}
	if !strings.Contains(result, "epf_validate_file") {
		t.Error("Expected preferred tool listed")
	}
	if strings.Contains(result, "AVOID TOOLS") {
		t.Error("Did not expect AVOID TOOLS section")
	}
}

func TestFormatSkillScope_AvoidOnly(t *testing.T) {
	result := FormatSkillScope(nil, []string{"epf_scaffold_generator"})

	if strings.Contains(result, "PREFERRED TOOLS") {
		t.Error("Did not expect PREFERRED TOOLS section")
	}
	if !strings.Contains(result, "AVOID TOOLS") {
		t.Error("Expected AVOID TOOLS header")
	}
	if !strings.Contains(result, "epf_scaffold_generator") {
		t.Error("Expected avoid tool listed")
	}
}

func TestFormatSkillScope_Both(t *testing.T) {
	preferred := []string{"epf_validate_file", "epf_get_schema"}
	avoid := []string{"epf_init_instance"}

	result := FormatSkillScope(preferred, avoid)

	if !strings.Contains(result, "PREFERRED TOOLS") {
		t.Error("Expected PREFERRED TOOLS header")
	}
	if !strings.Contains(result, "AVOID TOOLS") {
		t.Error("Expected AVOID TOOLS header")
	}
	if !strings.Contains(result, "Standalone Mode") {
		t.Error("Expected Standalone Mode indicator in header")
	}
}

func TestFormatSkillScope_MarkdownFormat(t *testing.T) {
	result := FormatSkillScope([]string{"tool1", "tool2"}, nil)

	// Should use backtick formatting for tool names
	if !strings.Contains(result, "`tool1`") {
		t.Error("Expected backtick-formatted tool name")
	}
	// Should use bullet points
	if !strings.Contains(result, "- `tool1`") {
		t.Error("Expected bullet-point format for tools")
	}
}

// =============================================================================
// Integration: buildAgentInstructionsOutput with pluginInfo
// =============================================================================

func TestBuildAgentInstructionsOutput_WithStandalonePlugin(t *testing.T) {
	pluginInfo := &PluginInfo{
		Detected:            false,
		StandaloneMode:      true,
		HostName:            "opencode",
		AvailablePlugin:     "opencode-epf",
		InstallHint:         "Add opencode-epf to plugin array",
		WhatYouGain:         pluginBenefits,
		StandaloneProtocols: standaloneProtocols,
	}

	output := buildAgentInstructionsOutput(nil, "", pluginInfo, auth.ModeLocal)

	if output.Orchestration == nil {
		t.Fatal("Expected Orchestration section in output")
	}
	if output.Orchestration.Detected {
		t.Error("Expected plugin not detected")
	}
	if !output.Orchestration.StandaloneMode {
		t.Error("Expected standalone mode")
	}
	if output.Orchestration.AvailablePlugin != "opencode-epf" {
		t.Errorf("Expected AvailablePlugin='opencode-epf', got '%s'", output.Orchestration.AvailablePlugin)
	}
	if len(output.Orchestration.StandaloneProtocols) == 0 {
		t.Error("Expected standalone protocols in output")
	}
}

func TestBuildAgentInstructionsOutput_WithDetectedPlugin(t *testing.T) {
	pluginInfo := &PluginInfo{
		Detected:         true,
		StandaloneMode:   false,
		PluginName:       "opencode-epf",
		PluginVersion:    "1.0.0",
		ActiveGuardrails: activeGuardrails,
	}

	output := buildAgentInstructionsOutput(nil, "", pluginInfo, auth.ModeLocal)

	if output.Orchestration == nil {
		t.Fatal("Expected Orchestration section in output")
	}
	if !output.Orchestration.Detected {
		t.Error("Expected plugin detected")
	}
	if output.Orchestration.StandaloneMode {
		t.Error("Expected standalone mode false")
	}
	if output.Orchestration.PluginName != "opencode-epf" {
		t.Errorf("Expected PluginName='opencode-epf', got '%s'", output.Orchestration.PluginName)
	}
	if len(output.Orchestration.ActiveGuardrails) == 0 {
		t.Error("Expected active guardrails")
	}
}

func TestBuildAgentInstructionsOutput_NilPlugin(t *testing.T) {
	output := buildAgentInstructionsOutput(nil, "", nil, auth.ModeLocal)

	if output.Orchestration != nil {
		t.Error("Expected no Orchestration section when pluginInfo is nil")
	}
}

func TestBuildAgentInstructionsOutput_MultiTenantMode(t *testing.T) {
	output := buildAgentInstructionsOutput(nil, "", nil, auth.ModeMultiTenant)

	if output.RemoteMode == nil {
		t.Fatal("Expected RemoteMode section in multi-tenant mode")
	}
	if output.RemoteMode.ServerMode != "multi-tenant" {
		t.Errorf("Expected ServerMode='multi-tenant', got '%s'", output.RemoteMode.ServerMode)
	}
	if len(output.RemoteMode.AvailableTools) == 0 {
		t.Error("Expected available tools list")
	}
	if len(output.RemoteMode.UnavailableTools) == 0 {
		t.Error("Expected unavailable tools list")
	}
	if output.RemoteMode.AuthInfo == "" {
		t.Error("Expected auth info for multi-tenant mode")
	}
	// Discovery should be overridden for remote mode
	if output.Discovery.InstanceFound {
		t.Error("Expected instance_found=false in remote mode")
	}
	// Workflow should mention epf_list_workspaces
	if len(output.Workflow.FirstSteps) == 0 || !strings.Contains(output.Workflow.FirstSteps[0], "epf_list_workspaces") {
		t.Error("Expected first step to mention epf_list_workspaces")
	}
}

func TestBuildAgentInstructionsOutput_LocalMode(t *testing.T) {
	output := buildAgentInstructionsOutput(nil, "", nil, auth.ModeLocal)

	if output.RemoteMode != nil {
		t.Error("Expected no RemoteMode section in local mode")
	}
	// Workflow should mention epf_health_check as first step
	if len(output.Workflow.FirstSteps) == 0 || !strings.Contains(output.Workflow.FirstSteps[0], "epf_health_check") {
		t.Error("Expected first step to mention epf_health_check")
	}
}

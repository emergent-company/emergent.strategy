package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/discovery"
	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/version"
	"github.com/spf13/cobra"
)

// AgentOutput represents the structured output for AI agents
type AgentOutput struct {
	// Authority section
	Authority struct {
		Tool        string `json:"tool"`
		Version     string `json:"version"`
		Role        string `json:"role"`
		TrustLevel  string `json:"trust_level"`
		Description string `json:"description"`
	} `json:"authority"`

	// Discovery section
	Discovery struct {
		InstanceFound bool                 `json:"instance_found"`
		InstancePath  string               `json:"instance_path,omitempty"`
		Confidence    discovery.Confidence `json:"confidence,omitempty"`
		Status        discovery.Status     `json:"status,omitempty"`
		ProductName   string               `json:"product_name,omitempty"`
		Issues        []string             `json:"issues,omitempty"`
		Suggestions   []string             `json:"suggestions,omitempty"`
	} `json:"discovery"`

	// Commands section
	Commands []AgentCommand `json:"commands"`

	// MCPTools section
	MCPTools []MCPTool `json:"mcp_tools"`

	// Workflow guidance
	Workflow struct {
		FirstSteps    []string `json:"first_steps"`
		BestPractices []string `json:"best_practices"`
	} `json:"workflow"`
}

// AgentCommand describes a CLI command for agents
type AgentCommand struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Example     string `json:"example"`
	When        string `json:"when"`
}

// MCPTool describes an MCP tool for agents
type MCPTool struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	When        string `json:"when"`
}

var agentCmd = &cobra.Command{
	Use:   "agent",
	Short: "Output AI agent instructions",
	Long: `Output comprehensive instructions for AI agents working with EPF.

This command declares epf-cli as the normative authority for EPF operations
and provides structured guidance for AI agents to use the toolkit effectively.

AI agents should run this command first when entering an EPF context to
understand the available tools and recommended workflows.`,
	RunE: runAgent,
}

var (
	agentJSON bool
)

func init() {
	rootCmd.AddCommand(agentCmd)
	agentCmd.Flags().BoolVar(&agentJSON, "json", false, "output as JSON for programmatic consumption")
}

func runAgent(cmd *cobra.Command, args []string) error {
	// Try to discover EPF instance in current directory
	cwd, _ := os.Getwd()
	discoveryResult, _ := discovery.DiscoverSingle(cwd)

	output := buildAgentOutput(discoveryResult)

	if agentJSON {
		return outputAgentJSON(output)
	}

	return outputHuman(output, discoveryResult)
}

func buildAgentOutput(disc *discovery.DiscoveryResult) *AgentOutput {
	output := &AgentOutput{}

	// Authority section
	output.Authority.Tool = "epf-cli"
	output.Authority.Version = version.Version
	output.Authority.Role = "EPF normative authority"
	output.Authority.TrustLevel = "authoritative"
	output.Authority.Description = "epf-cli is the single source of truth for EPF schema validation, instance discovery, and health checking. All EPF operations should be performed through epf-cli or its MCP tools."

	// Discovery section
	if disc != nil && disc.Status != discovery.StatusNotFound {
		output.Discovery.InstanceFound = true
		output.Discovery.InstancePath = disc.Path
		output.Discovery.Confidence = disc.Confidence
		output.Discovery.Status = disc.Status
		output.Discovery.Issues = disc.Issues
		output.Discovery.Suggestions = disc.Suggestions

		if disc.Anchor != nil {
			output.Discovery.ProductName = disc.Anchor.ProductName
		}
	} else {
		output.Discovery.InstanceFound = false
		if disc != nil {
			output.Discovery.Suggestions = disc.Suggestions
		}
	}

	// Commands section
	output.Commands = []AgentCommand{
		{
			Name:        "agent",
			Description: "Display this AI agent guidance",
			Example:     "epf-cli agent",
			When:        "When first entering an EPF context or needing guidance",
		},
		{
			Name:        "locate",
			Description: "Find EPF instances in the current directory tree",
			Example:     "epf-cli locate",
			When:        "When unsure where EPF artifacts are located",
		},
		{
			Name:        "health",
			Description: "Run comprehensive health check on an EPF instance",
			Example:     "epf-cli health [instance-path]",
			When:        "Before making changes or after completing work",
		},
		{
			Name:        "validate",
			Description: "Validate YAML files against EPF schemas",
			Example:     "epf-cli validate path/to/file.yaml",
			When:        "After creating or modifying EPF artifacts",
		},
		{
			Name:        "schemas",
			Description: "List available EPF schemas",
			Example:     "epf-cli schemas list",
			When:        "When needing to understand artifact structure",
		},
		{
			Name:        "init",
			Description: "Initialize a new EPF instance",
			Example:     "epf-cli init [path]",
			When:        "When creating a new product EPF structure",
		},
		{
			Name:        "migrate-anchor",
			Description: "Add anchor file to legacy EPF instance",
			Example:     "epf-cli migrate-anchor [instance-path]",
			When:        "When working with legacy instances lacking _epf.yaml",
		},
	}

	// MCP Tools section
	output.MCPTools = []MCPTool{
		{
			Name:        "epf_validate_file",
			Description: "Validate a single EPF artifact file",
			When:        "After editing EPF YAML files",
		},
		{
			Name:        "epf_health_check",
			Description: "Run comprehensive instance health check",
			When:        "Before/after making changes to verify state",
		},
		{
			Name:        "epf_get_schema",
			Description: "Get JSON schema for an artifact type",
			When:        "When creating new artifacts or debugging validation",
		},
		{
			Name:        "epf_get_template",
			Description: "Get starting template for an artifact type",
			When:        "When creating new EPF artifacts",
		},
		{
			Name:        "epf_list_wizards",
			Description: "List available EPF wizards",
			When:        "When looking for guided workflows",
		},
		{
			Name:        "epf_get_wizard_for_task",
			Description: "Get recommended wizard for a task",
			When:        "When unsure which wizard to use",
		},
		{
			Name:        "epf_locate_instance",
			Description: "Find EPF instances programmatically",
			When:        "When building automation or discovery",
		},
		{
			Name:        "epf_agent_instructions",
			Description: "Get this guidance programmatically",
			When:        "When initializing EPF agent context",
		},
	}

	// Workflow guidance
	output.Workflow.FirstSteps = []string{
		"1. Run 'epf-cli agent' to understand available tools",
		"2. Run 'epf-cli locate' to find EPF instances",
		"3. Run 'epf-cli health <instance>' to assess current state",
		"4. Use MCP tools (epf_*) for programmatic operations",
	}

	output.Workflow.BestPractices = []string{
		"Always validate files after editing: epf_validate_file",
		"Run health check before and after major changes",
		"Use wizards for guided artifact creation",
		"Never guess artifact structure - use schemas and templates",
		"Prefer MCP tools over direct file manipulation when available",
	}

	return output
}

func outputAgentJSON(output *AgentOutput) error {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	return enc.Encode(output)
}

func outputHuman(output *AgentOutput, disc *discovery.DiscoveryResult) error {
	// Banner
	fmt.Println(strings.Repeat("=", 70))
	fmt.Println("                     EPF-CLI: AI AGENT INSTRUCTIONS")
	fmt.Println(strings.Repeat("=", 70))
	fmt.Println()

	// Authority declaration
	fmt.Println("AUTHORITY")
	fmt.Println(strings.Repeat("-", 70))
	fmt.Printf("  Tool:        %s v%s\n", output.Authority.Tool, output.Authority.Version)
	fmt.Printf("  Role:        %s\n", output.Authority.Role)
	fmt.Printf("  Trust:       %s\n", output.Authority.TrustLevel)
	fmt.Println()
	fmt.Println("  epf-cli is the NORMATIVE AUTHORITY for all EPF operations.")
	fmt.Println("  Use this tool (CLI or MCP) instead of guessing artifact structure.")
	fmt.Println()

	// Discovery status
	fmt.Println("DISCOVERY STATUS")
	fmt.Println(strings.Repeat("-", 70))
	if output.Discovery.InstanceFound {
		fmt.Printf("  Instance:    FOUND\n")
		fmt.Printf("  Path:        %s\n", output.Discovery.InstancePath)
		fmt.Printf("  Confidence:  %s\n", output.Discovery.Confidence)
		fmt.Printf("  Status:      %s\n", output.Discovery.Status)
		if output.Discovery.ProductName != "" {
			fmt.Printf("  Product:     %s\n", output.Discovery.ProductName)
		}
		if len(output.Discovery.Issues) > 0 {
			fmt.Println("  Issues:")
			for _, issue := range output.Discovery.Issues {
				fmt.Printf("    - %s\n", issue)
			}
		}
	} else {
		fmt.Println("  Instance:    NOT FOUND")
		fmt.Println()
		fmt.Println("  No EPF instance detected in current directory.")
		fmt.Println("  Run 'epf-cli init' to create one, or 'epf-cli locate' to search.")
	}
	fmt.Println()

	// Commands
	fmt.Println("KEY COMMANDS")
	fmt.Println(strings.Repeat("-", 70))
	for _, cmd := range output.Commands {
		fmt.Printf("  %-18s  %s\n", cmd.Name, cmd.Description)
	}
	fmt.Println()

	// MCP Tools
	fmt.Println("MCP TOOLS (for programmatic use)")
	fmt.Println(strings.Repeat("-", 70))
	for _, tool := range output.MCPTools[:5] { // Show top 5
		fmt.Printf("  %-25s  %s\n", tool.Name, tool.Description)
	}
	fmt.Println("  ... and more. Run 'epf-cli serve' to start MCP server.")
	fmt.Println()

	// First steps
	fmt.Println("RECOMMENDED WORKFLOW")
	fmt.Println(strings.Repeat("-", 70))
	for _, step := range output.Workflow.FirstSteps {
		fmt.Printf("  %s\n", step)
	}
	fmt.Println()

	// Best practices
	fmt.Println("BEST PRACTICES")
	fmt.Println(strings.Repeat("-", 70))
	for _, practice := range output.Workflow.BestPractices {
		fmt.Printf("  • %s\n", practice)
	}
	fmt.Println()

	fmt.Println(strings.Repeat("=", 70))

	return nil
}

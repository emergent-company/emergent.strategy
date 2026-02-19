package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/discovery"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/version"
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

	// MandatoryProtocols defines workflows agents MUST follow
	MandatoryProtocols []MandatoryProtocol `json:"mandatory_protocols"`

	// WorkflowDecisionTree maps task types to tool sequences
	WorkflowDecisionTree []WorkflowDecision `json:"workflow_decision_tree"`

	// Commands section
	Commands []AgentCommand `json:"commands"`

	// MCPTools section
	MCPTools []MCPTool `json:"mcp_tools"`

	// Workflow guidance
	Workflow struct {
		FirstSteps    []string `json:"first_steps"`
		BestPractices []string `json:"best_practices"`
	} `json:"workflow"`

	// StrategyContext provides product strategy info when available
	StrategyContext *StrategyContextInfo `json:"strategy_context,omitempty"`
}

// MandatoryProtocol defines a workflow agents MUST follow
type MandatoryProtocol struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Steps       []string `json:"steps"`
}

// WorkflowDecision maps a task type to the tool sequence
type WorkflowDecision struct {
	TaskType string   `json:"task_type"`
	Tools    []string `json:"tools"`
	Note     string   `json:"note"`
}

// StrategyContextInfo provides product strategy metadata
type StrategyContextInfo struct {
	ProductName  string `json:"product_name"`
	InstancePath string `json:"instance_path"`
	Description  string `json:"description,omitempty"`
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

	// Mandatory Protocols section (1.1)
	output.MandatoryProtocols = []MandatoryProtocol{
		{
			Name:        "wizard_first",
			Description: "You MUST use a wizard before creating, substantially modifying, or evaluating any EPF artifact or instance.",
			Steps: []string{
				"1. Call epf_get_wizard_for_task with a description of what you need to do",
				"2. Call epf_get_wizard to retrieve the recommended wizard content",
				"3. Follow the wizard instructions to create/modify/evaluate the artifact",
				"4. Call epf_validate_file to verify the result",
			},
		},
		{
			Name:        "strategy_context",
			Description: "You MUST query strategy context before feature work, roadmap changes, or competitive decisions.",
			Steps: []string{
				"1. Call epf_get_product_vision to understand the product's purpose",
				"2. Call epf_get_personas to understand target users",
				"3. Call epf_get_roadmap_summary to see current OKRs",
				"4. Use this context to inform your work",
			},
		},
		{
			Name:        "validation_always",
			Description: "You MUST validate every artifact after creation or modification.",
			Steps: []string{
				"1. After writing any EPF YAML file, call epf_validate_file",
				"2. If errors are found, fix them and re-validate",
				"3. For large files, use epf_validate_with_plan for chunked fixing",
			},
		},
	}

	// Workflow Decision Tree (1.2)
	output.WorkflowDecisionTree = []WorkflowDecision{
		{
			TaskType: "create_artifact",
			Tools:    []string{"epf_get_wizard_for_task", "epf_get_wizard", "epf_get_template", "[write artifact]", "epf_validate_file"},
			Note:     "Always start with wizard recommendation, then follow wizard instructions",
		},
		{
			TaskType: "query_strategy",
			Tools:    []string{"epf_get_product_vision", "epf_get_personas", "epf_get_roadmap_summary", "epf_search_strategy"},
			Note:     "Use these to understand strategic context before any feature or roadmap work",
		},
		{
			TaskType: "assess_health",
			Tools:    []string{"epf_health_check", "epf_check_feature_quality", "epf_validate_relationships"},
			Note:     "Run health check first to assess scope, then drill into specific checks",
		},
		{
			TaskType: "fix_validation_errors",
			Tools:    []string{"epf_validate_with_plan", "epf_validate_section", "epf_get_section_example", "epf_validate_file"},
			Note:     "Use fix plan for chunked processing, validate section-by-section",
		},
		{
			TaskType: "aim_assessment",
			Tools:    []string{"epf_get_wizard_for_task", "epf_aim_assess", "epf_aim_validate_assumptions", "epf_aim_okr_progress"},
			Note:     "Start with wizard for guided assessment workflow",
		},
		{
			TaskType: "evaluate_quality",
			Tools:    []string{"epf_health_check", "epf_list_wizards(type=agent_prompt)", "epf_get_wizard", "[execute review against instance]"},
			Note:     "Run health check first, then retrieve and execute review wizards for semantic quality evaluation",
		},
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

	// MCP Tools section (1.3 — expanded with strategy tools)
	output.MCPTools = []MCPTool{
		// Wizard tools (MUST-use)
		{
			Name:        "epf_get_wizard_for_task",
			Description: "MUST be called before creating, modifying, or evaluating any EPF artifact or instance. Recommends the best wizard for the task.",
			When:        "MANDATORY first step before any artifact creation, modification, or quality evaluation",
		},
		{
			Name:        "epf_get_wizard",
			Description: "Retrieve full wizard instructions. Follow these to create artifacts or execute quality reviews.",
			When:        "After getting a wizard recommendation from epf_get_wizard_for_task (for creation, modification, or evaluation)",
		},
		{
			Name:        "epf_list_wizards",
			Description: "List all available EPF wizards by phase and type",
			When:        "When exploring available guided workflows",
		},
		// Validation tools
		{
			Name:        "epf_validate_file",
			Description: "Validate an EPF artifact file against its schema",
			When:        "MANDATORY after every artifact creation or modification",
		},
		{
			Name:        "epf_health_check",
			Description: "Run comprehensive instance health check",
			When:        "Before starting work and after completing major changes",
		},
		// Strategy query tools
		{
			Name:        "epf_get_product_vision",
			Description: "Get the product's vision, mission, and north star from the strategy instance",
			When:        "Before feature work, roadmap changes, or writing user-facing content",
		},
		{
			Name:        "epf_get_personas",
			Description: "Get all target personas with summaries",
			When:        "Before designing features or writing user-facing content",
		},
		{
			Name:        "epf_get_roadmap_summary",
			Description: "Get current OKRs and key results, optionally by track",
			When:        "Before planning work or prioritizing features",
		},
		{
			Name:        "epf_search_strategy",
			Description: "Full-text search across all strategy artifacts",
			When:        "When looking for specific strategy content by keyword",
		},
		{
			Name:        "epf_get_competitive_position",
			Description: "Get competitive analysis and market positioning",
			When:        "Before competitive feature design or positioning decisions",
		},
		// Template and schema tools
		{
			Name:        "epf_get_schema",
			Description: "Get JSON Schema for an artifact type",
			When:        "When needing to understand field constraints before writing",
		},
		{
			Name:        "epf_get_template",
			Description: "Get starting template for an artifact type",
			When:        "When creating new EPF artifacts (after consulting wizard)",
		},
		// Agent discovery
		{
			Name:        "epf_agent_instructions",
			Description: "Get this guidance programmatically via MCP",
			When:        "When initializing EPF agent context",
		},
		{
			Name:        "epf_locate_instance",
			Description: "Find EPF instances programmatically with confidence scoring",
			When:        "When building automation or searching for instances",
		},
		// Review/evaluation tools
		{
			Name:        "epf_recommend_reviews",
			Description: "Get applicable semantic review wizards for an instance",
			When:        "When evaluating instance quality or after health check shows structural health is good",
		},
		{
			Name:        "epf_review_strategic_coherence",
			Description: "Get strategic coherence review wizard",
			When:        "When evaluating vision-to-execution strategic alignment",
		},
		{
			Name:        "epf_review_feature_quality",
			Description: "Get feature quality review wizard",
			When:        "When evaluating feature definition quality (JTBD, personas, scenarios)",
		},
		{
			Name:        "epf_review_value_model",
			Description: "Get value model review wizard",
			When:        "When evaluating value model structure for anti-patterns",
		},
	}

	// Workflow guidance (1.4 — wizard-first as step 2, 1.5 — mandatory language)
	output.Workflow.FirstSteps = []string{
		"1. Run epf_health_check to assess current instance state",
		"2. Call epf_get_wizard_for_task before creating ANY artifact",
		"3. Query strategy context (epf_get_product_vision, epf_get_personas) before feature work",
		"4. Follow wizard instructions, then validate with epf_validate_file",
	}

	output.Workflow.BestPractices = []string{
		"You MUST call epf_get_wizard_for_task before creating, modifying, or evaluating any EPF artifact or instance",
		"You MUST validate every file after editing with epf_validate_file",
		"You MUST query strategy context before feature work or roadmap changes",
		"Run health check before and after major changes",
		"Never guess artifact structure — use schemas, templates, and wizards",
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

	// Mandatory Protocols (prominently displayed)
	fmt.Println("MANDATORY PROTOCOLS")
	fmt.Println(strings.Repeat("-", 70))
	for _, proto := range output.MandatoryProtocols {
		fmt.Printf("  [%s] %s\n", strings.ToUpper(proto.Name), proto.Description)
		for _, step := range proto.Steps {
			fmt.Printf("    %s\n", step)
		}
		fmt.Println()
	}

	// Workflow Decision Tree
	fmt.Println("WORKFLOW DECISION TREE")
	fmt.Println(strings.Repeat("-", 70))
	for _, decision := range output.WorkflowDecisionTree {
		fmt.Printf("  %-22s -> %s\n", decision.TaskType, strings.Join(decision.Tools, " -> "))
	}
	fmt.Println()

	// Strategy context (if available)
	if output.StrategyContext != nil {
		fmt.Println("STRATEGY CONTEXT")
		fmt.Println(strings.Repeat("-", 70))
		fmt.Printf("  Product:     %s\n", output.StrategyContext.ProductName)
		fmt.Printf("  Instance:    %s\n", output.StrategyContext.InstancePath)
		if output.StrategyContext.Description != "" {
			fmt.Printf("  Description: %s\n", output.StrategyContext.Description)
		}
		fmt.Println()
	}

	// Commands
	fmt.Println("KEY COMMANDS")
	fmt.Println(strings.Repeat("-", 70))
	for _, cmd := range output.Commands {
		fmt.Printf("  %-18s  %s\n", cmd.Name, cmd.Description)
	}
	fmt.Println()

	// MCP Tools — show all categorized
	fmt.Println("MCP TOOLS (for programmatic use)")
	fmt.Println(strings.Repeat("-", 70))
	for _, tool := range output.MCPTools {
		fmt.Printf("  %-30s  %s\n", tool.Name, tool.When)
	}
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
		fmt.Printf("  * %s\n", practice)
	}
	fmt.Println()

	fmt.Println(strings.Repeat("=", 70))

	return nil
}

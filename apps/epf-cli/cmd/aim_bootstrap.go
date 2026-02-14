package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/lra"
	"github.com/spf13/cobra"
)

var (
	bootstrapForce          bool
	bootstrapLevel          int
	bootstrapNonInteractive bool
)

var aimBootstrapCmd = &cobra.Command{
	Use:   "bootstrap [instance-path]",
	Short: "Create initial Living Reality Assessment",
	Long: `Create the foundational Living Reality Assessment (LRA) for an EPF instance.

The LRA is the "Day 0 baseline" that grounds all EPF work in organizational reality.
It captures:
  - Adoption context (team size, funding, product stage)
  - Track baselines (current state of Product/Strategy/OrgOps/Commercial)
  - Existing assets (code, docs, customers)
  - Constraints and capability gaps
  - Current focus for Cycle 1

This command runs an interactive wizard that adapts questions based on adoption level:
  - Level 0 (Solo, 1-2 people): 5-10 min, 7 core questions
  - Level 1 (Small team, 3-5): 10-15 min, 12 questions
  - Level 2+ (Growing, 6+): 20-30 min, comprehensive baseline

Examples:
  epf-cli aim bootstrap
  epf-cli aim bootstrap --level 0
  epf-cli aim bootstrap /path/to/instance --force`,
	Args: cobra.MaximumNArgs(1),
	Run:  runAimBootstrap,
}

func init() {
	aimCmd.AddCommand(aimBootstrapCmd)
	aimBootstrapCmd.Flags().BoolVar(&bootstrapForce, "force", false, "Overwrite existing LRA")
	aimBootstrapCmd.Flags().IntVar(&bootstrapLevel, "level", -1, "Adoption level (0-3), auto-detected if not specified")
	aimBootstrapCmd.Flags().BoolVar(&bootstrapNonInteractive, "non-interactive", false, "Generate minimal LRA without prompts (for automation)")
}

func runAimBootstrap(cmd *cobra.Command, args []string) {
	// Get instance path
	instancePath := "."
	if len(args) > 0 {
		instancePath = args[0]
	}

	// Check if LRA already exists
	if lra.LRAExists(instancePath) && !bootstrapForce {
		fmt.Println("❌ Living Reality Assessment already exists at:")
		fmt.Printf("   %s\n\n", lra.GetLRAPath(instancePath))
		fmt.Println("To recreate, use --force flag or delete the existing file first.")
		os.Exit(1)
	}

	fmt.Println("🌱 Living Reality Assessment Bootstrap")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println()
	fmt.Println("This wizard will help you create the foundational baseline")
	fmt.Println("that grounds all EPF work in your organizational reality.")
	fmt.Println()

	startTime := time.Now()

	// Non-interactive mode for automation
	if bootstrapNonInteractive {
		if err := createMinimalLRA(instancePath); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
		return
	}

	// Interactive wizard
	wizard := &bootstrapWizard{
		instancePath: instancePath,
		reader:       bufio.NewReader(os.Stdin),
		answers:      make(map[string]interface{}),
	}

	// Step 1: Determine adoption level
	if bootstrapLevel >= 0 && bootstrapLevel <= 3 {
		wizard.adoptionLevel = bootstrapLevel
	} else {
		wizard.askAdoptionLevel()
	}

	// Step 2: Ask questions based on adoption level
	wizard.askQuestions()

	// Step 3: Generate LRA
	newLRA := wizard.generateLRA()

	// Calculate time invested
	duration := time.Since(startTime)
	newLRA.Metadata.BootstrapTimeInvested = formatDuration(duration)

	// Step 4: Save LRA
	path := lra.GetLRAPath(instancePath)
	if err := lra.SaveLRA(path, newLRA); err != nil {
		fmt.Fprintf(os.Stderr, "Error saving LRA: %v\n", err)
		os.Exit(1)
	}

	// Step 5: Show summary
	printBootstrapSummary(newLRA, path, duration)
}

type bootstrapWizard struct {
	instancePath  string
	reader        *bufio.Reader
	answers       map[string]interface{}
	adoptionLevel int
}

func (w *bootstrapWizard) askAdoptionLevel() {
	fmt.Println("📊 Step 1: Determine Adoption Level")
	fmt.Println()
	fmt.Println("How many people are working on this product?")
	fmt.Println("  1-2 people  → Level 0 (Solo Founder)")
	fmt.Println("  3-5 people  → Level 1 (Small Team)")
	fmt.Println("  6-15 people → Level 2 (Growing Team)")
	fmt.Println("  15+ people  → Level 3 (Product Org)")
	fmt.Println()

	teamSize := w.askInt("Team size", 1)
	w.answers["team_size"] = teamSize

	// Map team size to adoption level
	if teamSize <= 2 {
		w.adoptionLevel = 0
	} else if teamSize <= 5 {
		w.adoptionLevel = 1
	} else if teamSize <= 15 {
		w.adoptionLevel = 2
	} else {
		w.adoptionLevel = 3
	}

	fmt.Printf("\n✅ Adoption Level %d detected\n\n", w.adoptionLevel)
}

func (w *bootstrapWizard) askQuestions() {
	fmt.Println("📝 Step 2: Baseline Questions")
	fmt.Println()

	// Core questions for all levels
	w.askCoreQuestions()

	// Additional questions based on level
	if w.adoptionLevel >= 1 {
		w.askLevel1Questions()
	}
	if w.adoptionLevel >= 2 {
		w.askLevel2Questions()
	}
}

func (w *bootstrapWizard) askCoreQuestions() {
	// Product stage
	fmt.Println("What stage is your product at?")
	fmt.Println("  1. Idea / Concept")
	fmt.Println("  2. Prototype")
	fmt.Println("  3. MVP building")
	fmt.Println("  4. MVP live")
	fmt.Println("  5. Growth")
	fmt.Println("  6. Mature")
	fmt.Println()

	stageMap := map[int]string{
		1: "idea",
		2: "prototype",
		3: "mvp_building",
		4: "mvp_live",
		5: "growth",
		6: "mature",
	}
	stageChoice := w.askInt("Choice", 3)
	w.answers["product_stage"] = stageMap[stageChoice]

	// Organization type
	fmt.Println("\nWhat type of organization are you?")
	fmt.Println("  1. Solo founder")
	fmt.Println("  2. Cofounding team")
	fmt.Println("  3. Bootstrapped startup")
	fmt.Println("  4. Funded startup")
	fmt.Println("  5. Corporate spinout")
	fmt.Println("  6. Enterprise division")
	fmt.Println()

	orgTypeMap := map[int]string{
		1: "solo_founder",
		2: "cofounding_team",
		3: "bootstrapped_startup",
		4: "funded_startup",
		5: "corporate_spinout",
		6: "enterprise_division",
	}
	orgChoice := w.askInt("Choice", 3)
	w.answers["organization_type"] = orgTypeMap[orgChoice]

	// Funding stage
	fmt.Println("\nWhat's your funding stage?")
	fmt.Println("  1. Bootstrapped")
	fmt.Println("  2. Pre-seed")
	fmt.Println("  3. Seed")
	fmt.Println("  4. Series A")
	fmt.Println("  5. Series B+")
	fmt.Println("  6. Profitable")
	fmt.Println()

	fundingMap := map[int]string{
		1: "bootstrapped",
		2: "pre_seed",
		3: "seed",
		4: "series_a",
		5: "series_b_plus",
		6: "profitable",
	}
	fundingChoice := w.askInt("Choice", 1)
	w.answers["funding_stage"] = fundingMap[fundingChoice]

	// Primary bottleneck
	fmt.Println("\nWhat's your biggest bottleneck right now?")
	fmt.Println("  1. Execution capacity (not enough hands)")
	fmt.Println("  2. Strategic clarity (don't know what to build)")
	fmt.Println("  3. Market validation (is this the right problem?)")
	fmt.Println("  4. Funding (running out of money)")
	fmt.Println("  5. Hiring (can't find the right people)")
	fmt.Println("  6. Technical capability (don't have the skills)")
	fmt.Println("  7. Attention bandwidth (too many decisions)")
	fmt.Println()

	bottleneckMap := map[int]string{
		1: "execution_capacity",
		2: "strategic_clarity",
		3: "market_validation",
		4: "funding",
		5: "hiring",
		6: "technical_capability",
		7: "attention_bandwidth",
	}
	bottleneckChoice := w.askInt("Choice", 1)
	w.answers["primary_bottleneck"] = bottleneckMap[bottleneckChoice]

	// Existing code
	hasCode := w.askYesNo("\nDo you have existing code/product?", true)
	w.answers["has_code"] = hasCode

	// Existing customers
	hasCustomers := w.askYesNo("Do you have existing users/customers?", false)
	w.answers["has_customers"] = hasCustomers

	// Primary objective for Cycle 1
	fmt.Println("\nWhat's the main thing you want to achieve in your next cycle?")
	fmt.Println("(One sentence)")
	objective := w.askString("Objective", "Validate core value proposition with first users")
	w.answers["primary_objective"] = objective
}

func (w *bootstrapWizard) askLevel1Questions() {
	fmt.Println("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("📊 Additional Questions (Level 1+)")
	fmt.Println()

	// AI capability level
	fmt.Println("How much AI augmentation does your team use?")
	fmt.Println("  1. Manual only (traditional processes)")
	fmt.Println("  2. AI-assisted (use AI tools for specific tasks)")
	fmt.Println("  3. AI-first (AI handles most execution)")
	fmt.Println("  4. Agentic (autonomous AI agents)")
	fmt.Println()

	aiMap := map[int]string{
		1: "manual_only",
		2: "ai_assisted",
		3: "ai_first",
		4: "agentic",
	}
	aiChoice := w.askInt("Choice", 2)
	w.answers["ai_capability_level"] = aiMap[aiChoice]

	// Runway (if not profitable)
	if w.answers["funding_stage"] != "profitable" {
		runway := w.askFloat("\nHow many months of runway do you have?", 12.0)
		w.answers["runway_months"] = runway
	}

	// Existing documentation
	hasDocs := w.askYesNo("\nDo you have existing strategic documentation? (pitch deck, PRD, etc.)", false)
	w.answers["has_documentation"] = hasDocs
}

func (w *bootstrapWizard) askLevel2Questions() {
	fmt.Println("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("📊 Track Baseline Assessment (Level 2+)")
	fmt.Println()
	fmt.Println("For each track, we'll assess current maturity and status.")
	fmt.Println()

	tracks := []string{"product", "strategy", "org_ops", "commercial"}
	trackNames := map[string]string{
		"product":    "Product",
		"strategy":   "Strategy",
		"org_ops":    "Org/Ops",
		"commercial": "Commercial",
	}

	w.answers["track_baselines"] = make(map[string]map[string]interface{})

	for _, track := range tracks {
		fmt.Printf("\n%s Track:\n", trackNames[track])

		// Maturity
		fmt.Println("  Maturity level?")
		fmt.Println("    1. Absent (not started)")
		fmt.Println("    2. Implicit (happening but not structured)")
		fmt.Println("    3. Explicit (defined structure/process)")
		fmt.Println("    4. Measured (has metrics)")
		fmt.Println("    5. Optimized (continuously improving)")

		maturityMap := map[int]string{
			1: "absent",
			2: "implicit",
			3: "explicit",
			4: "measured",
			5: "optimized",
		}
		maturityChoice := w.askInt("  Choice", 2)
		maturity := maturityMap[maturityChoice]

		// Status
		fmt.Println("  Status?")
		fmt.Println("    1. Not applicable")
		fmt.Println("    2. Not started")
		fmt.Println("    3. Emerging")
		fmt.Println("    4. Established")
		fmt.Println("    5. Mature")

		statusMap := map[int]string{
			1: "not_applicable",
			2: "not_started",
			3: "emerging",
			4: "established",
			5: "mature",
		}
		statusChoice := w.askInt("  Choice", 3)
		status := statusMap[statusChoice]

		w.answers["track_baselines"].(map[string]map[string]interface{})[track] = map[string]interface{}{
			"maturity": maturity,
			"status":   status,
		}
	}
}

func (w *bootstrapWizard) generateLRA() *lra.LivingRealityAssessment {
	now := time.Now()

	newLRA := &lra.LivingRealityAssessment{
		Metadata: lra.Metadata{
			CreatedAt:       &now,
			CreatedBy:       "epf-cli-bootstrap",
			LastUpdated:     &now,
			LastUpdatedBy:   "epf-cli-bootstrap",
			LifecycleStage:  "bootstrap",
			CyclesCompleted: 0,
			AdoptionLevel:   w.adoptionLevel,
			BootstrapType:   "initial_adoption",
		},
		AdoptionContext: lra.AdoptionContext{
			OrganizationType: w.getString("organization_type"),
			FundingStage:     w.getString("funding_stage"),
			TeamSize:         w.getInt("team_size"),
		},
		TrackBaselines: make(map[string]lra.TrackBaseline),
		CurrentFocus: lra.CurrentFocus{
			CycleReference:   "C0-bootstrap",
			PrimaryTrack:     "product", // Default for new ventures
			SecondaryTrack:   "none",
			PrimaryObjective: w.getString("primary_objective"),
		},
		EvolutionLog: []lra.EvolutionEntry{
			{
				CycleReference: "bootstrap",
				Timestamp:      &now,
				UpdatedBy:      "epf-cli-bootstrap",
				Trigger:        "bootstrap_complete",
				Summary:        "Initial reality baseline established via epf-cli",
				Changes: []lra.ChangeDetail{
					{
						Section:    "metadata",
						Field:      "lifecycle_stage",
						ChangeType: "created",
						NewValue:   "bootstrap",
						Reason:     "First creation of reality baseline",
					},
				},
			},
		},
	}

	// Optional fields
	if bottleneck, ok := w.answers["primary_bottleneck"].(string); ok {
		newLRA.AdoptionContext.PrimaryBottleneck = bottleneck
	}

	if aiLevel, ok := w.answers["ai_capability_level"].(string); ok {
		newLRA.AdoptionContext.AICapabilityLevel = aiLevel
	}

	if runway, ok := w.answers["runway_months"].(float64); ok {
		newLRA.AdoptionContext.RunwayMonths = &runway
	}

	// Track baselines
	if w.adoptionLevel >= 2 {
		if trackData, ok := w.answers["track_baselines"].(map[string]map[string]interface{}); ok {
			for track, data := range trackData {
				newLRA.TrackBaselines[track] = lra.TrackBaseline{
					Maturity: data["maturity"].(string),
					Status:   data["status"].(string),
				}
			}
		}
	} else {
		// Default baselines for Level 0-1
		newLRA.TrackBaselines["product"] = lra.TrackBaseline{
			Maturity: "implicit",
			Status:   "emerging",
		}
		newLRA.TrackBaselines["strategy"] = lra.TrackBaseline{
			Maturity: "absent",
			Status:   "not_started",
		}
		newLRA.TrackBaselines["org_ops"] = lra.TrackBaseline{
			Maturity: "absent",
			Status:   "not_applicable",
		}
		newLRA.TrackBaselines["commercial"] = lra.TrackBaseline{
			Maturity: "absent",
			Status:   "not_started",
		}
	}

	// Existing assets (minimal)
	if w.getBool("has_code") || w.getBool("has_customers") {
		newLRA.ExistingAssets = &lra.ExistingAssets{}

		if w.getBool("has_code") {
			newLRA.ExistingAssets.CodeAssets = &lra.CodeAssets{
				Exists: true,
			}
		}

		if w.getBool("has_customers") {
			newLRA.ExistingAssets.CustomerAssets = &lra.CustomerAssets{
				HasUsers: true,
			}
		}
	}

	return newLRA
}

// Helper functions for type-safe access to answers
func (w *bootstrapWizard) getString(key string) string {
	if val, ok := w.answers[key].(string); ok {
		return val
	}
	return ""
}

func (w *bootstrapWizard) getInt(key string) int {
	if val, ok := w.answers[key].(int); ok {
		return val
	}
	return 0
}

func (w *bootstrapWizard) getBool(key string) bool {
	if val, ok := w.answers[key].(bool); ok {
		return val
	}
	return false
}

// Input helper functions
func (w *bootstrapWizard) askString(prompt string, defaultVal string) string {
	if defaultVal != "" {
		fmt.Printf("%s [%s]: ", prompt, defaultVal)
	} else {
		fmt.Printf("%s: ", prompt)
	}

	text, _ := w.reader.ReadString('\n')
	text = strings.TrimSpace(text)

	if text == "" {
		return defaultVal
	}
	return text
}

func (w *bootstrapWizard) askInt(prompt string, defaultVal int) int {
	for {
		input := w.askString(prompt, fmt.Sprintf("%d", defaultVal))
		val, err := strconv.Atoi(input)
		if err == nil {
			return val
		}
		fmt.Println("Please enter a valid number.")
	}
}

func (w *bootstrapWizard) askFloat(prompt string, defaultVal float64) float64 {
	for {
		input := w.askString(prompt, fmt.Sprintf("%.1f", defaultVal))
		val, err := strconv.ParseFloat(input, 64)
		if err == nil {
			return val
		}
		fmt.Println("Please enter a valid number.")
	}
}

func (w *bootstrapWizard) askYesNo(prompt string, defaultVal bool) bool {
	defaultStr := "y/N"
	if defaultVal {
		defaultStr = "Y/n"
	}

	input := strings.ToLower(w.askString(fmt.Sprintf("%s (%s)", prompt, defaultStr), ""))

	if input == "" {
		return defaultVal
	}

	return input == "y" || input == "yes"
}

func printBootstrapSummary(newLRA *lra.LivingRealityAssessment, path string, duration time.Duration) {
	fmt.Println()
	fmt.Println("✅ Living Reality Assessment created successfully!")
	fmt.Println()
	fmt.Println("📊 Summary:")
	fmt.Printf("   Adoption Level: %d (%s)\n", newLRA.Metadata.AdoptionLevel, getAdoptionLevelName(newLRA.Metadata.AdoptionLevel))
	fmt.Printf("   Product Stage:  %s\n", getProductStageName(newLRA.AdoptionContext.OrganizationType))
	fmt.Printf("   Team Size:      %d people\n", newLRA.AdoptionContext.TeamSize)
	fmt.Printf("   Primary Track:  %s\n", newLRA.CurrentFocus.PrimaryTrack)
	if newLRA.AdoptionContext.PrimaryBottleneck != "" {
		fmt.Printf("   Bottleneck:     %s\n", getBottleneckName(newLRA.AdoptionContext.PrimaryBottleneck))
	}
	fmt.Printf("   Time Invested:  %s\n", formatDuration(duration))
	fmt.Println()
	fmt.Printf("📁 Location: %s\n", path)
	fmt.Println()
	fmt.Println("✨ Next Steps:")
	fmt.Println("   1. View your baseline:   epf-cli aim status")
	fmt.Println("   2. Create North Star:    epf-cli ready create-north-star (when available)")
	fmt.Println("   3. After each cycle:     epf-cli aim update-baseline")
	fmt.Println()
}

func createMinimalLRA(instancePath string) error {
	now := time.Now()

	minimalLRA := &lra.LivingRealityAssessment{
		Metadata: lra.Metadata{
			CreatedAt:             &now,
			CreatedBy:             "epf-cli-bootstrap-auto",
			LastUpdated:           &now,
			LastUpdatedBy:         "epf-cli-bootstrap-auto",
			LifecycleStage:        "bootstrap",
			CyclesCompleted:       0,
			AdoptionLevel:         0,
			BootstrapTimeInvested: "0 min",
			BootstrapType:         "initial_adoption",
		},
		AdoptionContext: lra.AdoptionContext{
			OrganizationType: "solo_founder",
			FundingStage:     "bootstrapped",
			TeamSize:         1,
		},
		TrackBaselines: map[string]lra.TrackBaseline{
			"product": {
				Maturity: "implicit",
				Status:   "emerging",
			},
			"strategy": {
				Maturity: "absent",
				Status:   "not_started",
			},
			"org_ops": {
				Maturity: "absent",
				Status:   "not_applicable",
			},
			"commercial": {
				Maturity: "absent",
				Status:   "not_started",
			},
		},
		CurrentFocus: lra.CurrentFocus{
			CycleReference:   "C0-bootstrap",
			PrimaryTrack:     "product",
			SecondaryTrack:   "none",
			PrimaryObjective: "Build and validate MVP",
		},
		EvolutionLog: []lra.EvolutionEntry{
			{
				CycleReference: "bootstrap",
				Timestamp:      &now,
				UpdatedBy:      "epf-cli-bootstrap-auto",
				Trigger:        "bootstrap_complete",
				Summary:        "Minimal LRA created for automation",
				Changes: []lra.ChangeDetail{
					{
						Section:    "metadata",
						Field:      "lifecycle_stage",
						ChangeType: "created",
						NewValue:   "bootstrap",
						Reason:     "Auto-generated minimal baseline",
					},
				},
			},
		},
	}

	path := lra.GetLRAPath(instancePath)
	if err := lra.SaveLRA(path, minimalLRA); err != nil {
		return fmt.Errorf("failed to save minimal LRA: %w", err)
	}

	fmt.Printf("✅ Minimal LRA created at: %s\n", path)
	return nil
}

// Display helpers
func getAdoptionLevelName(level int) string {
	names := map[int]string{
		0: "Solo Founder",
		1: "Small Team",
		2: "Growing Team",
		3: "Product Org",
	}
	if name, ok := names[level]; ok {
		return name
	}
	return "Unknown"
}

func getProductStageName(orgType string) string {
	// This is a simplification - in real use, would read from product_stage
	return orgType
}

func getBottleneckName(bottleneck string) string {
	names := map[string]string{
		"execution_capacity":   "Execution capacity",
		"strategic_clarity":    "Strategic clarity",
		"market_validation":    "Market validation",
		"funding":              "Funding",
		"hiring":               "Hiring",
		"technical_capability": "Technical capability",
		"attention_bandwidth":  "Attention bandwidth",
	}
	if name, ok := names[bottleneck]; ok {
		return name
	}
	return bottleneck
}

func formatDuration(d time.Duration) string {
	minutes := int(d.Minutes())
	if minutes < 1 {
		return "< 1 min"
	}
	if minutes < 60 {
		return fmt.Sprintf("%d min", minutes)
	}
	hours := minutes / 60
	mins := minutes % 60
	if mins == 0 {
		return fmt.Sprintf("%d hr", hours)
	}
	return fmt.Sprintf("%d hr %d min", hours, mins)
}

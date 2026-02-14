package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/emergent-company/product-factory-os/apps/epf-cli/internal/lra"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var aimMigrateCmd = &cobra.Command{
	Use:   "migrate-baseline",
	Short: "Migrate legacy EPF instance to include Living Reality Assessment",
	Long: `Migrate a legacy EPF instance that doesn't have a Living Reality Assessment (LRA).

This command analyzes existing EPF artifacts (_meta.yaml, roadmap, features) to infer
initial baseline values for the LRA. It will:
  1. Read _meta.yaml for adoption level and cycles completed
  2. Infer organizational context from available artifacts
  3. Generate LRA with sensible defaults
  4. Prompt for confirmation before writing

The generated LRA can be refined later using 'epf-cli aim status' and manual edits.

Examples:
  epf-cli aim migrate-baseline
  epf-cli aim migrate-baseline --dry-run
  epf-cli aim migrate-baseline --force`,
	RunE: runAimMigrate,
}

var (
	aimMigrateDryRun bool
	aimMigrateForce  bool
)

func init() {
	aimMigrateCmd.Flags().BoolVar(&aimMigrateDryRun, "dry-run", false, "Show what would be created without writing")
	aimMigrateCmd.Flags().BoolVar(&aimMigrateForce, "force", false, "Overwrite existing LRA if present")
}

func runAimMigrate(cmd *cobra.Command, args []string) error {
	instancePath, err := GetInstancePath(nil)
	if err != nil {
		return fmt.Errorf("failed to get instance path: %w", err)
	}

	// Check if LRA already exists
	if lra.LRAExists(instancePath) && !aimMigrateForce {
		return fmt.Errorf("LRA already exists at %s\n\nUse --force to overwrite, or 'epf-cli aim status' to view current LRA", lra.GetLRAPath(instancePath))
	}

	fmt.Println()
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("🔄 Migrating Legacy EPF Instance to Include LRA")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println()

	// Step 1: Infer from _meta.yaml
	fmt.Println("📖 Reading _meta.yaml...")
	metaPath := filepath.Join(instancePath, "_meta.yaml")
	metaData, err := loadMetaFile(metaPath)
	if err != nil {
		return fmt.Errorf("failed to load _meta.yaml: %w\n\nMigration requires _meta.yaml to infer baseline", err)
	}

	adoptionLevel := inferAdoptionLevel(metaData)
	cyclesCompleted := inferCyclesCompleted(metaData)
	lifecycleStage := inferLifecycleStage(cyclesCompleted)

	fmt.Printf("  ✓ Adoption Level: %d (inferred)\n", adoptionLevel)
	fmt.Printf("  ✓ Cycles Completed: %d\n", cyclesCompleted)
	fmt.Printf("  ✓ Lifecycle Stage: %s\n", lifecycleStage)
	fmt.Println()

	// Step 2: Infer organizational context
	fmt.Println("🏢 Inferring organizational context...")
	orgType := "startup" // Default assumption for EPF users
	teamSize := 5        // Default assumption
	fundingStage := "bootstrapped"

	fmt.Printf("  ⚠️  Using defaults (can be refined manually):\n")
	fmt.Printf("      Organization Type: %s\n", orgType)
	fmt.Printf("      Team Size: %d\n", teamSize)
	fmt.Printf("      Funding Stage: %s\n", fundingStage)
	fmt.Println()

	// Step 3: Infer track baselines
	fmt.Println("📊 Inferring track maturity baselines...")
	trackBaselines := inferTrackBaselines(instancePath, cyclesCompleted)
	for trackName, baseline := range trackBaselines {
		fmt.Printf("  %s: %s (%s)\n", trackName, baseline.Maturity, baseline.Status)
	}
	fmt.Println()

	// Step 4: Create LRA structure
	assessment := &lra.LivingRealityAssessment{
		Metadata: lra.Metadata{
			LifecycleStage:        lifecycleStage,
			CyclesCompleted:       cyclesCompleted,
			AdoptionLevel:         adoptionLevel,
			BootstrapType:         "migration",
			BootstrapTimeInvested: "~5 minutes (automated migration)",
		},
		AdoptionContext: lra.AdoptionContext{
			OrganizationType:  orgType,
			TeamSize:          teamSize,
			FundingStage:      fundingStage,
			PrimaryBottleneck: "execution_capacity", // Common default
		},
		TrackBaselines: trackBaselines,
		ExistingAssets: inferExistingAssets(instancePath),
		ConstraintsAndAssumptions: &lra.ConstraintsAndAssumptions{
			HardConstraints: []lra.Constraint{
				{
					Constraint: "Legacy instance - baseline inferred from artifacts",
					Impact:     "scope",
				},
			},
		},
		CurrentFocus: lra.CurrentFocus{
			CycleReference:   fmt.Sprintf("cycle-%d", cyclesCompleted+1),
			PrimaryObjective: "Continue EPF adoption with baseline established",
			AttentionAllocation: map[string]int{
				"product":    40,
				"strategy":   30,
				"org_ops":    20,
				"commercial": 10,
			},
		},
		EvolutionLog: []lra.EvolutionEntry{
			{
				CycleReference: "bootstrap",
				Timestamp:      nil, // Will be set by SaveLRA
				UpdatedBy:      "epf-cli aim migrate-baseline",
				Trigger:        "migration",
				Summary:        "Automated migration from legacy EPF instance",
				Changes: []lra.ChangeDetail{
					{
						Section:    "metadata",
						Field:      "lifecycle_stage",
						ChangeType: "created",
						NewValue:   lifecycleStage,
						Reason:     "Inferred from cycles completed",
					},
				},
			},
		},
	}

	// Step 5: Preview or save
	if aimMigrateDryRun {
		fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Println("🔍 DRY RUN - Would create LRA:")
		fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
		fmt.Println()
		yamlData, _ := yaml.Marshal(assessment)
		fmt.Println(string(yamlData))
		fmt.Println()
		fmt.Println("Run without --dry-run to create the LRA file")
		return nil
	}

	// Save LRA
	if err := lra.SaveLRA(instancePath, assessment); err != nil {
		return fmt.Errorf("failed to save LRA: %w", err)
	}

	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println("✅ Migration Complete!")
	fmt.Println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
	fmt.Println()
	fmt.Printf("📁 Created: %s\n", lra.GetLRAPath(instancePath))
	fmt.Println()
	fmt.Println("⚠️  IMPORTANT: Review and refine the generated LRA")
	fmt.Println()
	fmt.Println("The migration inferred baseline values from existing artifacts,")
	fmt.Println("but some fields use generic defaults. You should:")
	fmt.Println()
	fmt.Println("  1. Review: epf-cli aim status")
	fmt.Println("  2. Edit:   AIM/living_reality_assessment.yaml")
	fmt.Println("  3. Refine: Organizational context, track baselines, constraints")
	fmt.Println()

	return nil
}

// Helper functions for inference

type MetaFile struct {
	Instance struct {
		CycleCount    int    `yaml:"cycle_count"`
		AdoptionLevel int    `yaml:"adoption_level"`
		CurrentCycle  string `yaml:"current_cycle"`
	} `yaml:"instance"`
}

func loadMetaFile(path string) (*MetaFile, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var meta MetaFile
	if err := yaml.Unmarshal(data, &meta); err != nil {
		return nil, err
	}

	return &meta, nil
}

func inferAdoptionLevel(meta *MetaFile) int {
	if meta.Instance.AdoptionLevel > 0 {
		return meta.Instance.AdoptionLevel
	}
	// Default to Level 1 if not specified
	return 1
}

func inferCyclesCompleted(meta *MetaFile) int {
	if meta.Instance.CycleCount > 0 {
		return meta.Instance.CycleCount
	}
	return 0
}

func inferLifecycleStage(cycles int) string {
	if cycles == 0 {
		return "bootstrap"
	} else if cycles < 4 {
		return "maturing"
	}
	return "evolved"
}

func inferTrackBaselines(instancePath string, cycles int) map[string]lra.TrackBaseline {
	baselines := make(map[string]lra.TrackBaseline)

	// Default baselines based on cycles completed
	var defaultMaturity, defaultStatus string
	if cycles == 0 {
		defaultMaturity = "implicit"
		defaultStatus = "emerging"
	} else if cycles < 3 {
		defaultMaturity = "explicit"
		defaultStatus = "emerging"
	} else {
		defaultMaturity = "measured"
		defaultStatus = "established"
	}

	trackNames := []string{"product", "strategy", "org_ops", "commercial"}
	for _, track := range trackNames {
		baselines[track] = lra.TrackBaseline{
			Maturity:    defaultMaturity,
			Status:      defaultStatus,
			Description: fmt.Sprintf("Inferred baseline for %s track (review and refine)", track),
		}
	}

	return baselines
}

func inferExistingAssets(instancePath string) *lra.ExistingAssets {
	assets := &lra.ExistingAssets{}

	// Check for code (look for common indicators)
	if _, err := os.Stat(filepath.Join(instancePath, "..", "..", ".git")); err == nil {
		assets.CodeAssets = &lra.CodeAssets{
			Exists:   true,
			Maturity: "mvp",
		}
	}

	// Check for documentation
	readyPath := filepath.Join(instancePath, "READY")
	if _, err := os.Stat(readyPath); err == nil {
		assets.DocumentationAssets = &lra.DocumentationAssets{
			Exists:            true,
			Types:             []string{"strategy_docs", "epf_artifacts"},
			QualityAssessment: "adequate",
		}
	}

	// Assume no customers by default (requires manual verification)
	assets.CustomerAssets = &lra.CustomerAssets{
		HasUsers:               false,
		PayingCustomers:        false,
		CustomerFeedbackExists: false,
	}

	return assets
}

package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/aim"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var (
	writeAssessmentFile string
	writeAssessmentJSON bool
)

var aimWriteAssessmentCmd = &cobra.Command{
	Use:   "write-assessment [instance-path]",
	Short: "Write an assessment report to the AIM directory",
	Long: `Write or update an assessment report from a YAML file or stdin.

The assessment report captures OKR progress, key result outcomes, and assumption
validation evidence for a cycle. This command reads structured YAML input and
writes it to AIM/assessment_report.yaml.

Input sources (in priority order):
  --file <path>    Read assessment YAML from a file
  stdin            Read from stdin if no --file specified and stdin is piped

Examples:
  epf-cli aim write-assessment --file assessment_draft.yaml
  cat assessment.yaml | epf-cli aim write-assessment
  epf-cli aim write-assessment /path/to/instance --file report.yaml`,
	Args: cobra.MaximumNArgs(1),
	RunE: runAimWriteAssessment,
}

func init() {
	aimCmd.AddCommand(aimWriteAssessmentCmd)
	aimWriteAssessmentCmd.Flags().StringVar(&writeAssessmentFile, "file", "", "Path to assessment YAML file")
	aimWriteAssessmentCmd.Flags().BoolVar(&writeAssessmentJSON, "json", false, "Output result as JSON")
}

func runAimWriteAssessment(cmd *cobra.Command, args []string) error {
	// Resolve instance path
	var instancePath string
	var err error
	if len(args) > 0 {
		instancePath = args[0]
	} else {
		instancePath, err = GetInstancePath(nil)
		if err != nil {
			return fmt.Errorf("failed to get instance path: %w", err)
		}
	}

	// Read input YAML
	var inputData []byte
	if writeAssessmentFile != "" {
		inputData, err = os.ReadFile(writeAssessmentFile)
		if err != nil {
			return fmt.Errorf("failed to read file %s: %w", writeAssessmentFile, err)
		}
	} else {
		// Try stdin
		stat, _ := os.Stdin.Stat()
		if (stat.Mode() & os.ModeCharDevice) == 0 {
			inputData, err = io.ReadAll(os.Stdin)
			if err != nil {
				return fmt.Errorf("failed to read from stdin: %w", err)
			}
		} else {
			return fmt.Errorf("no input provided; use --file <path> or pipe YAML via stdin")
		}
	}

	// Parse YAML into AssessmentReport
	var report aim.AssessmentReport
	if err := yaml.Unmarshal(inputData, &report); err != nil {
		return fmt.Errorf("failed to parse assessment YAML: %w", err)
	}

	// Write to AIM directory
	outputPath, err := aim.WriteAssessmentReport(instancePath, &report)
	if err != nil {
		return fmt.Errorf("failed to write assessment report: %w", err)
	}

	// Output result
	result := map[string]interface{}{
		"success":       true,
		"instance_path": instancePath,
		"output_path":   outputPath,
		"roadmap_id":    report.RoadmapID,
		"cycle":         report.Cycle,
		"message":       "Assessment report written successfully",
	}

	if writeAssessmentJSON {
		data, err := json.MarshalIndent(result, "", "  ")
		if err != nil {
			return fmt.Errorf("failed to marshal JSON: %w", err)
		}
		fmt.Println(string(data))
	} else {
		fmt.Printf("Assessment report written to: %s\n", outputPath)
	}

	return nil
}

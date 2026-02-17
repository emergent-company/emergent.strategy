package aim

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// LoadRoadmap loads the roadmap from the READY phase.
func LoadRoadmap(instancePath string) (*RoadmapData, error) {
	path := filepath.Join(instancePath, "READY", "05_roadmap_recipe.yaml")
	return LoadRoadmapFromPath(path)
}

// LoadRoadmapFromPath loads a roadmap from an explicit file path.
func LoadRoadmapFromPath(path string) (*RoadmapData, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read roadmap file: %w", err)
	}

	var roadmap RoadmapData
	if err := yaml.Unmarshal(data, &roadmap); err != nil {
		return nil, fmt.Errorf("failed to parse roadmap YAML: %w", err)
	}

	return &roadmap, nil
}

// LoadAssessmentReports loads all assessment reports from the AIM directory.
// Returns an empty slice (not error) when none are found, so callers can
// distinguish "no reports yet" from "I/O failure".
func LoadAssessmentReports(instancePath string) ([]AssessmentReport, error) {
	aimDir := filepath.Join(instancePath, "AIM")
	return LoadAssessmentReportsFromDir(aimDir)
}

// LoadAssessmentReportsFromDir loads assessment reports from a specific directory.
func LoadAssessmentReportsFromDir(aimDir string) ([]AssessmentReport, error) {
	if _, err := os.Stat(aimDir); os.IsNotExist(err) {
		return nil, fmt.Errorf("AIM directory not found")
	}

	files, err := filepath.Glob(filepath.Join(aimDir, "*assessment_report*.yaml"))
	if err != nil {
		return nil, err
	}

	if len(files) == 0 {
		return nil, fmt.Errorf("no assessment report files found")
	}

	var assessments []AssessmentReport
	for _, file := range files {
		data, err := os.ReadFile(file)
		if err != nil {
			continue
		}

		var assessment AssessmentReport
		if err := yaml.Unmarshal(data, &assessment); err != nil {
			continue
		}

		assessments = append(assessments, assessment)
	}

	if len(assessments) == 0 {
		return nil, fmt.Errorf("no valid assessment reports found")
	}

	return assessments, nil
}

// LoadCalibrationMemo loads a calibration memo from the AIM directory.
func LoadCalibrationMemo(instancePath string) (*CalibrationMemo, error) {
	path := filepath.Join(instancePath, "AIM", "calibration_memo.yaml")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read calibration memo: %w", err)
	}

	var memo CalibrationMemo
	if err := yaml.Unmarshal(data, &memo); err != nil {
		return nil, fmt.Errorf("failed to parse calibration memo: %w", err)
	}

	return &memo, nil
}

// GetAllTracks returns all four tracks as a map keyed by track name.
func GetAllTracks(roadmap *RoadmapData) map[string]TrackData {
	return map[string]TrackData{
		"product":    roadmap.Roadmap.Tracks.Product,
		"strategy":   roadmap.Roadmap.Tracks.Strategy,
		"org_ops":    roadmap.Roadmap.Tracks.OrgOps,
		"commercial": roadmap.Roadmap.Tracks.Commercial,
	}
}

// GetTrackFromID infers the track from an OKR or KR ID.
// IDs follow patterns like okr-p-001, kr-s-002, etc.
func GetTrackFromID(id string) string {
	parts := strings.Split(id, "-")
	if len(parts) < 3 {
		return "unknown"
	}

	switch parts[1] {
	case "p":
		return "product"
	case "s":
		return "strategy"
	case "o":
		return "org_ops"
	case "c":
		return "commercial"
	default:
		return "unknown"
	}
}

// LoadStrategicRealityCheck loads an SRC from the AIM directory.
func LoadStrategicRealityCheck(instancePath string) (*StrategicRealityCheck, error) {
	path := filepath.Join(instancePath, "AIM", "strategic_reality_check.yaml")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read strategic reality check: %w", err)
	}

	var src StrategicRealityCheck
	if err := yaml.Unmarshal(data, &src); err != nil {
		return nil, fmt.Errorf("failed to parse strategic reality check: %w", err)
	}

	return &src, nil
}

// Percentage calculates (part/total)*100, returning 0 if total is 0.
func Percentage(part, total int) int {
	if total == 0 {
		return 0
	}
	return (part * 100) / total
}

// ContainsInt checks if a slice contains a value.
func ContainsInt(slice []int, val int) bool {
	for _, item := range slice {
		if item == val {
			return true
		}
	}
	return false
}

// GetTargetFromKR extracts a target string from a KR, falling back to a placeholder.
func GetTargetFromKR(kr KRData) string {
	if kr.Target != "" {
		return kr.Target
	}
	if strings.Contains(kr.Description, "target:") || strings.Contains(kr.Description, "Target:") {
		return "TODO: Extract target from description or add explicit target"
	}
	return "TODO: Define measurable target for this KR"
}

// BuildOKRMetadata builds a map of OKR ID -> objective text from the roadmap.
func BuildOKRMetadata(roadmap *RoadmapData) map[string]string {
	metadata := make(map[string]string)
	for _, track := range GetAllTracks(roadmap) {
		for _, okr := range track.OKRs {
			metadata[okr.ID] = okr.Objective
		}
	}
	return metadata
}

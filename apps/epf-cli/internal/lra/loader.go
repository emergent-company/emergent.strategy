package lra

import (
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// LoadLRA loads a Living Reality Assessment from a file
func LoadLRA(path string) (*LivingRealityAssessment, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read LRA file: %w", err)
	}

	var lra LivingRealityAssessment
	if err := yaml.Unmarshal(data, &lra); err != nil {
		return nil, fmt.Errorf("failed to parse LRA YAML: %w", err)
	}

	return &lra, nil
}

// SaveLRA saves a Living Reality Assessment to a file
func SaveLRA(path string, lra *LivingRealityAssessment) error {
	data, err := yaml.Marshal(lra)
	if err != nil {
		return fmt.Errorf("failed to marshal LRA to YAML: %w", err)
	}

	// Ensure directory exists
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create directory: %w", err)
	}

	// Write file
	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("failed to write LRA file: %w", err)
	}

	return nil
}

// GetLRAPath returns the expected path for an instance's LRA
func GetLRAPath(instancePath string) string {
	return filepath.Join(instancePath, "AIM", "living_reality_assessment.yaml")
}

// LRAExists checks if an LRA file exists for an instance
func LRAExists(instancePath string) bool {
	path := GetLRAPath(instancePath)
	_, err := os.Stat(path)
	return err == nil
}

// LoadOrError loads LRA or returns a descriptive error
func LoadOrError(instancePath string) (*LivingRealityAssessment, error) {
	path := GetLRAPath(instancePath)

	if !LRAExists(instancePath) {
		return nil, fmt.Errorf("Living Reality Assessment not found at: %s\n\nThe LRA is the foundational baseline for all EPF work.\nCreate it with: epf-cli aim bootstrap", path)
	}

	return LoadLRA(path)
}

// LoadOrWarn loads LRA or returns nil with warning (for optional LRA checks)
func LoadOrWarn(instancePath string) (*LivingRealityAssessment, bool) {
	lra, err := LoadOrError(instancePath)
	if err != nil {
		return nil, false
	}
	return lra, true
}

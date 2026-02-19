package relationships

import (
	"fmt"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/roadmap"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/valuemodel"
)

// ValidationSeverity indicates how serious a validation error is.
type ValidationSeverity string

const (
	SeverityError   ValidationSeverity = "error"
	SeverityWarning ValidationSeverity = "warning"
	SeverityInfo    ValidationSeverity = "info"
)

// ValidationError represents a single validation error with helpful context.
type ValidationError struct {
	// Severity indicates how serious the error is
	Severity ValidationSeverity

	// Source is the artifact that contains the error (e.g., "fd-001", "kr-p-001")
	Source string

	// SourceType describes what kind of artifact (e.g., "feature", "key_result")
	SourceType string

	// Field is the field that contains the invalid value (e.g., "contributes_to", "value_model_target")
	Field string

	// InvalidPath is the path that failed validation
	InvalidPath string

	// Message describes the error
	Message string

	// AvailablePaths lists valid alternatives at the same level
	AvailablePaths []string

	// DidYouMean suggests a similar valid path
	DidYouMean string

	// Hint provides additional context to help fix the error
	Hint string
}

// Error implements the error interface.
func (e *ValidationError) Error() string {
	return fmt.Sprintf("[%s] %s.%s: %s (path: %q)", e.Severity, e.Source, e.Field, e.Message, e.InvalidPath)
}

// ValidationResult contains the results of validating relationships.
type ValidationResult struct {
	// Valid indicates if all paths validated successfully
	Valid bool

	// Errors contains all validation errors found
	Errors []*ValidationError

	// Stats provides summary statistics
	Stats ValidationStats
}

// ValidationStats provides summary statistics for validation.
type ValidationStats struct {
	TotalFeaturesChecked int
	TotalKRsChecked      int
	TotalMappingsChecked int
	TotalPathsChecked    int
	ValidPaths           int
	InvalidPaths         int
	ErrorCount           int
	WarningCount         int
}

// AddError adds an error to the result and updates stats.
func (r *ValidationResult) AddError(err *ValidationError) {
	r.Errors = append(r.Errors, err)
	r.Valid = false
	r.Stats.InvalidPaths++
	if err.Severity == SeverityError {
		r.Stats.ErrorCount++
	} else if err.Severity == SeverityWarning {
		r.Stats.WarningCount++
	}
}

// GetErrors returns only errors (not warnings or info).
func (r *ValidationResult) GetErrors() []*ValidationError {
	var errors []*ValidationError
	for _, e := range r.Errors {
		if e.Severity == SeverityError {
			errors = append(errors, e)
		}
	}
	return errors
}

// GetWarnings returns only warnings.
func (r *ValidationResult) GetWarnings() []*ValidationError {
	var warnings []*ValidationError
	for _, e := range r.Errors {
		if e.Severity == SeverityWarning {
			warnings = append(warnings, e)
		}
	}
	return warnings
}

// GroupBySource groups validation errors by their source artifact.
func (r *ValidationResult) GroupBySource() map[string][]*ValidationError {
	grouped := make(map[string][]*ValidationError)
	for _, e := range r.Errors {
		grouped[e.Source] = append(grouped[e.Source], e)
	}
	return grouped
}

// Validator validates relationships between EPF artifacts.
type Validator struct {
	resolver    *valuemodel.Resolver
	valueModels *valuemodel.ValueModelSet
}

// NewValidator creates a new relationship validator.
func NewValidator(valueModels *valuemodel.ValueModelSet) *Validator {
	return &Validator{
		resolver:    valuemodel.NewResolver(valueModels),
		valueModels: valueModels,
	}
}

// ValidateAll validates all features, KRs, and mappings against the value model.
func (v *Validator) ValidateAll(features *FeatureSet, roadmapData *roadmap.Roadmap, mappings []MappingEntry) *ValidationResult {
	result := &ValidationResult{
		Valid: true,
	}

	// Validate features
	v.validateFeatures(features, result)

	// Validate KRs
	if roadmapData != nil {
		v.validateKRs(roadmapData, result)
	}

	// Validate mappings
	if len(mappings) > 0 {
		v.validateMappings(mappings, result)
	}

	return result
}

// ValidateFeatures validates all feature contributes_to paths.
func (v *Validator) ValidateFeatures(features *FeatureSet) *ValidationResult {
	result := &ValidationResult{
		Valid: true,
	}
	v.validateFeatures(features, result)
	return result
}

// ValidateKRs validates all KR value_model_target paths.
func (v *Validator) ValidateKRs(roadmapData *roadmap.Roadmap) *ValidationResult {
	result := &ValidationResult{
		Valid: true,
	}
	v.validateKRs(roadmapData, result)
	return result
}

// validateFeatures validates all feature contributes_to paths.
func (v *Validator) validateFeatures(features *FeatureSet, result *ValidationResult) {
	for _, feature := range features.ByID {
		result.Stats.TotalFeaturesChecked++

		for _, path := range feature.StrategicContext.ContributesTo {
			result.Stats.TotalPathsChecked++

			err := v.validatePath(path)
			if err != nil {
				pathErr := v.toValidationError(err, feature.ID, "feature", "contributes_to", path)
				result.AddError(pathErr)
			} else {
				result.Stats.ValidPaths++
			}
		}
	}
}

// validateKRs validates all KR value_model_target paths.
func (v *Validator) validateKRs(roadmapData *roadmap.Roadmap, result *ValidationResult) {
	krIndex := roadmap.NewKRIndex(roadmapData)

	for krID, entry := range krIndex.ByID {
		result.Stats.TotalKRsChecked++

		if entry.KR.ValueModelTarget == nil || entry.KR.ValueModelTarget.ComponentPath == "" {
			continue
		}

		// Build full path from track + component_path
		fullPath := buildKRPath(entry.KR.ValueModelTarget.Track, entry.KR.ValueModelTarget.ComponentPath)
		result.Stats.TotalPathsChecked++

		err := v.validatePath(fullPath)
		if err != nil {
			pathErr := v.toValidationError(err, krID, "key_result", "value_model_target.component_path", fullPath)
			result.AddError(pathErr)
		} else {
			result.Stats.ValidPaths++
		}
	}
}

// validatePath validates a single path against the value model.
func (v *Validator) validatePath(path string) error {
	_, err := v.resolver.Resolve(path)
	return err
}

// toValidationError converts a path error to a validation error with context.
func (v *Validator) toValidationError(err error, source, sourceType, field, path string) *ValidationError {
	validationErr := &ValidationError{
		Severity:    SeverityError,
		Source:      source,
		SourceType:  sourceType,
		Field:       field,
		InvalidPath: path,
		Message:     err.Error(),
	}

	// Extract rich context from PathError if available
	if pathErr, ok := err.(*valuemodel.PathError); ok {
		validationErr.Message = pathErr.Message
		validationErr.AvailablePaths = pathErr.AvailablePaths
		validationErr.DidYouMean = pathErr.DidYouMean
		validationErr.Hint = pathErr.Hint
	}

	return validationErr
}

// ValidateFeature validates a single feature's contributes_to paths.
func (v *Validator) ValidateFeature(feature *FeatureDefinition) []*ValidationError {
	var errors []*ValidationError

	for _, path := range feature.StrategicContext.ContributesTo {
		err := v.validatePath(path)
		if err != nil {
			errors = append(errors, v.toValidationError(err, feature.ID, "feature", "contributes_to", path))
		}
	}

	return errors
}

// ValidateKR validates a single KR's value_model_target path.
func (v *Validator) ValidateKR(kr *roadmap.KeyResult, krID string) *ValidationError {
	if kr.ValueModelTarget == nil || kr.ValueModelTarget.ComponentPath == "" {
		return nil
	}

	fullPath := buildKRPath(kr.ValueModelTarget.Track, kr.ValueModelTarget.ComponentPath)
	err := v.validatePath(fullPath)
	if err != nil {
		return v.toValidationError(err, krID, "key_result", "value_model_target.component_path", fullPath)
	}

	return nil
}

// ValidatePath validates a single path and returns detailed results.
func (v *Validator) ValidatePath(path string) (*PathValidationResult, error) {
	resolution, err := v.resolver.Resolve(path)
	if err != nil {
		return &PathValidationResult{
			Valid:        false,
			Path:         path,
			ErrorMessage: err.Error(),
		}, err
	}

	return &PathValidationResult{
		Valid:         true,
		Path:          path,
		CanonicalPath: resolution.CanonicalPath,
		Track:         string(resolution.Track),
		Depth:         resolution.Depth,
	}, nil
}

// PathValidationResult contains detailed validation results for a single path.
type PathValidationResult struct {
	Valid         bool
	Path          string
	CanonicalPath string
	Track         string
	Depth         int
	ErrorMessage  string
}

// buildKRPath builds a full value model path from track and component path.
// KR paths are typically in the format "product" + "core-platform.data-management"
// which should become "Product.CorePlatform.DataManagement"
func buildKRPath(track, componentPath string) string {
	// Normalize track name
	normalizedTrack := normalizeTrackName(track)

	// Normalize component path segments
	parts := strings.Split(componentPath, ".")
	for i, part := range parts {
		parts[i] = kebabToPascal(part)
	}

	return normalizedTrack + "." + strings.Join(parts, ".")
}

// normalizeTrackName converts track to canonical form.
func normalizeTrackName(track string) string {
	switch strings.ToLower(track) {
	case "product":
		return "Product"
	case "strategy":
		return "Strategy"
	case "org_ops", "orgops", "org-ops":
		return "OrgOps"
	case "commercial":
		return "Commercial"
	default:
		// Fallback: capitalize first letter
		if len(track) > 0 {
			return strings.ToUpper(track[:1]) + track[1:]
		}
		return track
	}
}

// kebabToPascal converts kebab-case to PascalCase.
func kebabToPascal(s string) string {
	parts := strings.Split(s, "-")
	for i, part := range parts {
		if len(part) > 0 {
			parts[i] = strings.ToUpper(part[:1]) + part[1:]
		}
	}
	return strings.Join(parts, "")
}

// validateMappings validates all sub_component_id paths in mappings data.
func (v *Validator) validateMappings(mappings []MappingEntry, result *ValidationResult) {
	for _, entry := range mappings {
		result.Stats.TotalMappingsChecked++

		if entry.SubComponentID == "" {
			continue
		}

		result.Stats.TotalPathsChecked++

		err := v.validatePath(entry.SubComponentID)
		if err != nil {
			pathErr := v.toValidationError(err, entry.SubComponentID, "mapping", "sub_component_id", entry.SubComponentID)
			result.AddError(pathErr)
		} else {
			result.Stats.ValidPaths++
		}
	}
}

// Summary returns a human-readable summary of validation results.
func (r *ValidationResult) Summary() string {
	var sb strings.Builder

	sb.WriteString("Validation Summary:\n")
	sb.WriteString(fmt.Sprintf("  Features checked: %d\n", r.Stats.TotalFeaturesChecked))
	sb.WriteString(fmt.Sprintf("  KRs checked: %d\n", r.Stats.TotalKRsChecked))
	sb.WriteString(fmt.Sprintf("  Mappings checked: %d\n", r.Stats.TotalMappingsChecked))
	sb.WriteString(fmt.Sprintf("  Paths checked: %d\n", r.Stats.TotalPathsChecked))
	sb.WriteString(fmt.Sprintf("  Valid: %d\n", r.Stats.ValidPaths))
	sb.WriteString(fmt.Sprintf("  Invalid: %d\n", r.Stats.InvalidPaths))

	if r.Valid {
		sb.WriteString("\n✓ All paths are valid\n")
	} else {
		sb.WriteString(fmt.Sprintf("\n✗ %d error(s), %d warning(s)\n", r.Stats.ErrorCount, r.Stats.WarningCount))

		// List errors grouped by source
		grouped := r.GroupBySource()
		for source, errors := range grouped {
			sb.WriteString(fmt.Sprintf("\n%s:\n", source))
			for _, err := range errors {
				sb.WriteString(fmt.Sprintf("  - %s: %s\n", err.Field, err.Message))
				if err.DidYouMean != "" {
					sb.WriteString(fmt.Sprintf("    Did you mean: %s?\n", err.DidYouMean))
				}
			}
		}
	}

	return sb.String()
}

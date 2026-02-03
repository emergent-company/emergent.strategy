// Package roadmap provides loading and parsing of EPF roadmap recipe files.
// Roadmaps translate strategy into execution plans across four parallel tracks
// (Product, Strategy, OrgOps, Commercial) using OKR methodology.
package roadmap

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// Track represents a roadmap track (Product, Strategy, OrgOps, Commercial).
type Track string

const (
	TrackProduct    Track = "product"
	TrackStrategy   Track = "strategy"
	TrackOrgOps     Track = "org_ops"
	TrackCommercial Track = "commercial"
)

// ValidTracks contains all valid track names.
var ValidTracks = []Track{
	TrackProduct,
	TrackStrategy,
	TrackOrgOps,
	TrackCommercial,
}

// ValueModelTarget links a KR to a specific Value Model component for maturity tracking.
type ValueModelTarget struct {
	Track             string `yaml:"track,omitempty"`
	ComponentPath     string `yaml:"component_path,omitempty"`
	TargetMaturity    string `yaml:"target_maturity,omitempty"`
	MaturityRationale string `yaml:"maturity_rationale,omitempty"`
}

// KeyResult represents a measurable outcome within an OKR.
type KeyResult struct {
	ID                   string            `yaml:"id"`
	Description          string            `yaml:"description"`
	Target               string            `yaml:"target,omitempty"`
	MeasurementMethod    string            `yaml:"measurement_method,omitempty"`
	Baseline             string            `yaml:"baseline,omitempty"`
	Status               string            `yaml:"status,omitempty"`
	CompletionDate       string            `yaml:"completion_date,omitempty"`
	ActualResult         string            `yaml:"actual_result,omitempty"`
	TRLStart             int               `yaml:"trl_start,omitempty"`
	TRLTarget            int               `yaml:"trl_target,omitempty"`
	TRLAchieved          int               `yaml:"trl_achieved,omitempty"`
	TRLProgression       string            `yaml:"trl_progression,omitempty"`
	TechnicalHypothesis  string            `yaml:"technical_hypothesis,omitempty"`
	ExperimentDesign     string            `yaml:"experiment_design,omitempty"`
	SuccessCriteria      string            `yaml:"success_criteria,omitempty"`
	UncertaintyAddressed string            `yaml:"uncertainty_addressed,omitempty"`
	AchievementNotes     string            `yaml:"achievement_notes,omitempty"`
	ValueModelTarget     *ValueModelTarget `yaml:"value_model_target,omitempty"`
}

// OKR represents an Objective and Key Results group.
type OKR struct {
	ID         string      `yaml:"id"`
	Objective  string      `yaml:"objective"`
	KeyResults []KeyResult `yaml:"key_results,omitempty"`
}

// Assumption represents a riskiest assumption that needs validation.
type Assumption struct {
	ID               string   `yaml:"id"`
	Description      string   `yaml:"description"`
	Type             string   `yaml:"type,omitempty"`
	Criticality      string   `yaml:"criticality,omitempty"`
	Confidence       string   `yaml:"confidence,omitempty"`
	EvidenceRequired string   `yaml:"evidence_required,omitempty"`
	LinkedToKR       []string `yaml:"linked_to_kr,omitempty"`
}

// SolutionComponent represents a component in the solution scaffold.
type SolutionComponent struct {
	ID               string `yaml:"id"`
	Name             string `yaml:"name"`
	Purpose          string `yaml:"purpose,omitempty"`
	Priority         string `yaml:"priority,omitempty"`
	MapsToValueModel string `yaml:"maps_to_value_model,omitempty"`
}

// SolutionScaffold describes the high-level solution architecture for a track.
type SolutionScaffold struct {
	Description            string              `yaml:"description,omitempty"`
	KeyComponents          []SolutionComponent `yaml:"key_components,omitempty"`
	ArchitecturePrinciples []string            `yaml:"architecture_principles,omitempty"`
	TechnicalConstraints   []string            `yaml:"technical_constraints,omitempty"`
}

// TrackConfig represents a single track's configuration in the roadmap.
type TrackConfig struct {
	TrackObjective      string            `yaml:"track_objective,omitempty"`
	OKRs                []OKR             `yaml:"okrs,omitempty"`
	RiskiestAssumptions []Assumption      `yaml:"riskiest_assumptions,omitempty"`
	SolutionScaffold    *SolutionScaffold `yaml:"solution_scaffold,omitempty"`
}

// CrossTrackDependency represents a dependency between KRs across tracks.
type CrossTrackDependency struct {
	FromKR         string `yaml:"from_kr"`
	ToKR           string `yaml:"to_kr"`
	DependencyType string `yaml:"dependency_type,omitempty"`
	Description    string `yaml:"description,omitempty"`
}

// ParallelTrack represents a group of KRs that can be pursued in parallel.
type ParallelTrack struct {
	Name       string   `yaml:"name"`
	KeyResults []string `yaml:"key_results"`
	Timeframe  string   `yaml:"timeframe,omitempty"`
	DependsOn  []string `yaml:"depends_on,omitempty"`
}

// KeyMilestone represents a significant decision point or launch event.
type KeyMilestone struct {
	Date       string   `yaml:"date,omitempty"`
	Milestone  string   `yaml:"milestone"`
	KeyResults []string `yaml:"key_results"`
}

// ExecutionPlan defines the high-level execution plan at KR level.
type ExecutionPlan struct {
	SequencingRationale string          `yaml:"sequencing_rationale,omitempty"`
	CriticalPath        []string        `yaml:"critical_path,omitempty"`
	ParallelTracks      []ParallelTrack `yaml:"parallel_tracks,omitempty"`
	KeyMilestones       []KeyMilestone  `yaml:"key_milestones,omitempty"`
}

// Tracks holds all four track configurations.
type Tracks struct {
	Product    *TrackConfig `yaml:"product,omitempty"`
	Strategy   *TrackConfig `yaml:"strategy,omitempty"`
	OrgOps     *TrackConfig `yaml:"org_ops,omitempty"`
	Commercial *TrackConfig `yaml:"commercial,omitempty"`
}

// Roadmap represents a complete roadmap recipe.
type Roadmap struct {
	ID                     string                 `yaml:"id"`
	StrategyID             string                 `yaml:"strategy_id,omitempty"`
	Cycle                  int                    `yaml:"cycle,omitempty"`
	Timeframe              string                 `yaml:"timeframe,omitempty"`
	Tracks                 Tracks                 `yaml:"tracks"`
	CrossTrackDependencies []CrossTrackDependency `yaml:"cross_track_dependencies,omitempty"`
	ExecutionPlan          *ExecutionPlan         `yaml:"execution_plan,omitempty"`
	Status                 string                 `yaml:"status,omitempty"`
	ApprovedBy             string                 `yaml:"approved_by,omitempty"`
	ApprovalDate           string                 `yaml:"approval_date,omitempty"`
	StartDate              string                 `yaml:"start_date,omitempty"`
	TargetCompletionDate   string                 `yaml:"target_completion_date,omitempty"`
}

// RoadmapFile is the root structure of a roadmap recipe YAML file.
type RoadmapFile struct {
	Roadmap Roadmap `yaml:"roadmap"`
}

// Loader handles loading roadmap recipes from an EPF instance.
type Loader struct {
	instancePath string
}

// NewLoader creates a new roadmap loader for an EPF instance.
func NewLoader(instancePath string) *Loader {
	return &Loader{
		instancePath: instancePath,
	}
}

// Load loads the roadmap recipe from the instance's READY directory.
// The roadmap recipe is typically at READY/05_roadmap_recipe.yaml.
func (l *Loader) Load() (*Roadmap, error) {
	// Try standard location first
	roadmapPath := filepath.Join(l.instancePath, "READY", "05_roadmap_recipe.yaml")
	if _, err := os.Stat(roadmapPath); os.IsNotExist(err) {
		// Try without numbered prefix
		roadmapPath = filepath.Join(l.instancePath, "READY", "roadmap_recipe.yaml")
		if _, err := os.Stat(roadmapPath); os.IsNotExist(err) {
			return nil, fmt.Errorf("roadmap recipe not found at READY/05_roadmap_recipe.yaml or READY/roadmap_recipe.yaml")
		}
	}

	return l.LoadFile(roadmapPath)
}

// LoadFile loads a roadmap recipe from a specific YAML file.
func (l *Loader) LoadFile(filePath string) (*Roadmap, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to read file: %w", err)
	}

	var roadmapFile RoadmapFile
	if err := yaml.Unmarshal(data, &roadmapFile); err != nil {
		return nil, fmt.Errorf("failed to parse YAML: %w", err)
	}

	return &roadmapFile.Roadmap, nil
}

// GetAllKRs returns all Key Results across all tracks.
func (r *Roadmap) GetAllKRs() []KeyResult {
	var krs []KeyResult

	if r.Tracks.Product != nil {
		for _, okr := range r.Tracks.Product.OKRs {
			krs = append(krs, okr.KeyResults...)
		}
	}
	if r.Tracks.Strategy != nil {
		for _, okr := range r.Tracks.Strategy.OKRs {
			krs = append(krs, okr.KeyResults...)
		}
	}
	if r.Tracks.OrgOps != nil {
		for _, okr := range r.Tracks.OrgOps.OKRs {
			krs = append(krs, okr.KeyResults...)
		}
	}
	if r.Tracks.Commercial != nil {
		for _, okr := range r.Tracks.Commercial.OKRs {
			krs = append(krs, okr.KeyResults...)
		}
	}

	return krs
}

// GetKRsByTrack returns Key Results for a specific track.
func (r *Roadmap) GetKRsByTrack(track Track) []KeyResult {
	var config *TrackConfig
	switch track {
	case TrackProduct:
		config = r.Tracks.Product
	case TrackStrategy:
		config = r.Tracks.Strategy
	case TrackOrgOps:
		config = r.Tracks.OrgOps
	case TrackCommercial:
		config = r.Tracks.Commercial
	}

	if config == nil {
		return nil
	}

	var krs []KeyResult
	for _, okr := range config.OKRs {
		krs = append(krs, okr.KeyResults...)
	}
	return krs
}

// GetKR retrieves a specific Key Result by ID.
func (r *Roadmap) GetKR(krID string) (*KeyResult, Track, bool) {
	// Determine track from ID prefix
	track := trackFromKRID(krID)
	if track == "" {
		// Search all tracks
		for _, t := range ValidTracks {
			krs := r.GetKRsByTrack(t)
			for i := range krs {
				if krs[i].ID == krID {
					return &krs[i], t, true
				}
			}
		}
		return nil, "", false
	}

	krs := r.GetKRsByTrack(track)
	for i := range krs {
		if krs[i].ID == krID {
			return &krs[i], track, true
		}
	}
	return nil, "", false
}

// trackFromKRID extracts the track from a KR ID (e.g., "kr-p-001" -> TrackProduct).
func trackFromKRID(krID string) Track {
	if !strings.HasPrefix(krID, "kr-") {
		return ""
	}
	parts := strings.Split(krID, "-")
	if len(parts) < 2 {
		return ""
	}
	switch parts[1] {
	case "p":
		return TrackProduct
	case "s":
		return TrackStrategy
	case "o":
		return TrackOrgOps
	case "c":
		return TrackCommercial
	default:
		return ""
	}
}

// GetKRsWithValueModelTargets returns all KRs that have value_model_target defined.
func (r *Roadmap) GetKRsWithValueModelTargets() []KeyResult {
	var krs []KeyResult
	for _, kr := range r.GetAllKRs() {
		if kr.ValueModelTarget != nil && kr.ValueModelTarget.ComponentPath != "" {
			krs = append(krs, kr)
		}
	}
	return krs
}

// KRIndex provides indexed access to Key Results.
type KRIndex struct {
	// ByID maps KR ID to the KR and its track.
	ByID map[string]*KREntry

	// ByValueModelPath maps value model paths to KRs targeting that path.
	// This is the reverse index: value_model_path -> []KR
	ByValueModelPath map[string][]*KREntry

	// ByTrack maps track to all KRs in that track.
	ByTrack map[Track][]*KREntry
}

// KREntry holds a Key Result with its context.
type KREntry struct {
	KR      *KeyResult
	Track   Track
	OKRID   string
	Roadmap *Roadmap
}

// NewKRIndex creates an index of all Key Results in the roadmap.
func NewKRIndex(roadmap *Roadmap) *KRIndex {
	idx := &KRIndex{
		ByID:             make(map[string]*KREntry),
		ByValueModelPath: make(map[string][]*KREntry),
		ByTrack:          make(map[Track][]*KREntry),
	}

	// Index Product track
	if roadmap.Tracks.Product != nil {
		idx.indexTrack(roadmap, TrackProduct, roadmap.Tracks.Product)
	}

	// Index Strategy track
	if roadmap.Tracks.Strategy != nil {
		idx.indexTrack(roadmap, TrackStrategy, roadmap.Tracks.Strategy)
	}

	// Index OrgOps track
	if roadmap.Tracks.OrgOps != nil {
		idx.indexTrack(roadmap, TrackOrgOps, roadmap.Tracks.OrgOps)
	}

	// Index Commercial track
	if roadmap.Tracks.Commercial != nil {
		idx.indexTrack(roadmap, TrackCommercial, roadmap.Tracks.Commercial)
	}

	return idx
}

// indexTrack indexes all KRs in a track.
func (idx *KRIndex) indexTrack(roadmap *Roadmap, track Track, config *TrackConfig) {
	for _, okr := range config.OKRs {
		for i := range okr.KeyResults {
			kr := &okr.KeyResults[i]
			entry := &KREntry{
				KR:      kr,
				Track:   track,
				OKRID:   okr.ID,
				Roadmap: roadmap,
			}

			// Index by ID
			idx.ByID[kr.ID] = entry

			// Index by track
			idx.ByTrack[track] = append(idx.ByTrack[track], entry)

			// Index by value model path (if present)
			if kr.ValueModelTarget != nil && kr.ValueModelTarget.ComponentPath != "" {
				path := normalizeValueModelPath(kr.ValueModelTarget.Track, kr.ValueModelTarget.ComponentPath)
				idx.ByValueModelPath[path] = append(idx.ByValueModelPath[path], entry)
			}
		}
	}
}

// normalizeValueModelPath creates a full path from track and component path.
// e.g., ("product", "core-platform.data-management") -> "Product.CorePlatform.DataManagement"
func normalizeValueModelPath(track, componentPath string) string {
	// Capitalize track name
	trackName := normalizeTrackName(track)

	// Convert component path from kebab-case to PascalCase
	parts := strings.Split(componentPath, ".")
	for i, part := range parts {
		parts[i] = kebabToPascal(part)
	}

	return trackName + "." + strings.Join(parts, ".")
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
// e.g., "core-platform" -> "CorePlatform"
func kebabToPascal(s string) string {
	parts := strings.Split(s, "-")
	for i, part := range parts {
		if len(part) > 0 {
			parts[i] = strings.ToUpper(part[:1]) + part[1:]
		}
	}
	return strings.Join(parts, "")
}

// GetKRsTargetingPath returns all KRs that target a specific value model path.
func (idx *KRIndex) GetKRsTargetingPath(path string) []*KREntry {
	// Try exact match first
	if entries, ok := idx.ByValueModelPath[path]; ok {
		return entries
	}

	// Try normalized path
	normalizedPath := normalizeForComparison(path)
	for p, entries := range idx.ByValueModelPath {
		if normalizeForComparison(p) == normalizedPath {
			return entries
		}
	}

	return nil
}

// GetAllValueModelPaths returns all unique value model paths targeted by KRs.
func (idx *KRIndex) GetAllValueModelPaths() []string {
	paths := make([]string, 0, len(idx.ByValueModelPath))
	for path := range idx.ByValueModelPath {
		paths = append(paths, path)
	}
	return paths
}

// normalizeForComparison normalizes a path for case-insensitive comparison.
func normalizeForComparison(path string) string {
	// Remove separators and lowercase
	path = strings.ReplaceAll(path, "-", "")
	path = strings.ReplaceAll(path, "_", "")
	path = strings.ReplaceAll(path, ".", "")
	return strings.ToLower(path)
}

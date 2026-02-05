package lra

import "time"

// LivingRealityAssessment represents the complete LRA structure
type LivingRealityAssessment struct {
	Metadata                  Metadata                   `yaml:"metadata"`
	AdoptionContext           AdoptionContext            `yaml:"adoption_context"`
	TrackBaselines            map[string]TrackBaseline   `yaml:"track_baselines"`
	ExistingAssets            *ExistingAssets            `yaml:"existing_assets,omitempty"`
	ConstraintsAndAssumptions *ConstraintsAndAssumptions `yaml:"constraints_and_assumptions,omitempty"`
	CurrentFocus              CurrentFocus               `yaml:"current_focus"`
	EvolutionLog              []EvolutionEntry           `yaml:"evolution_log"`
}

// Metadata captures lifecycle metadata
type Metadata struct {
	CreatedAt             *time.Time `yaml:"created_at,omitempty"`
	CreatedBy             string     `yaml:"created_by,omitempty"`
	LastUpdated           *time.Time `yaml:"last_updated,omitempty"`
	LastUpdatedBy         string     `yaml:"last_updated_by,omitempty"`
	LifecycleStage        string     `yaml:"lifecycle_stage"` // bootstrap | maturing | evolved
	CyclesCompleted       int        `yaml:"cycles_completed"`
	AdoptionLevel         int        `yaml:"adoption_level"` // 0-3
	BootstrapTimeInvested string     `yaml:"bootstrap_time_invested,omitempty"`
	BootstrapType         string     `yaml:"bootstrap_type,omitempty"` // initial_adoption | major_pivot | etc.
}

// AdoptionContext captures organizational context
type AdoptionContext struct {
	OrganizationType  string   `yaml:"organization_type"` // solo_founder | cofounding_team | etc.
	FundingStage      string   `yaml:"funding_stage"`     // bootstrapped | pre_seed | seed | etc.
	TeamSize          int      `yaml:"team_size"`
	AICapabilityLevel string   `yaml:"ai_capability_level,omitempty"` // manual_only | ai_assisted | etc.
	PrimaryBottleneck string   `yaml:"primary_bottleneck,omitempty"`  // execution_capacity | strategic_clarity | etc.
	RunwayMonths      *float64 `yaml:"runway_months,omitempty"`
}

// TrackBaseline captures current state of one track
type TrackBaseline struct {
	Maturity      string   `yaml:"maturity"` // absent | implicit | explicit | measured | optimized
	Status        string   `yaml:"status"`   // not_applicable | not_started | emerging | established | mature
	Description   string   `yaml:"description,omitempty"`
	KeyActivities []string `yaml:"key_activities,omitempty"`
	PainPoints    []string `yaml:"pain_points,omitempty"`
	Strengths     []string `yaml:"strengths,omitempty"`
}

// ExistingAssets captures what already exists
type ExistingAssets struct {
	CodeAssets          *CodeAssets          `yaml:"code_assets,omitempty"`
	DocumentationAssets *DocumentationAssets `yaml:"documentation_assets,omitempty"`
	CustomerAssets      *CustomerAssets      `yaml:"customer_assets,omitempty"`
	StrategicAssets     *StrategicAssets     `yaml:"strategic_assets,omitempty"`
	ProcessAssets       *ProcessAssets       `yaml:"process_assets,omitempty"`
}

type CodeAssets struct {
	Exists           bool   `yaml:"exists"`
	Maturity         string `yaml:"maturity,omitempty"` // prototype | mvp | production | scaling
	TechStackSummary string `yaml:"tech_stack_summary,omitempty"`
}

type DocumentationAssets struct {
	Exists            bool     `yaml:"exists"`
	Types             []string `yaml:"types,omitempty"`              // product_specs | technical_docs | etc.
	QualityAssessment string   `yaml:"quality_assessment,omitempty"` // outdated | partial | adequate | comprehensive
}

type CustomerAssets struct {
	HasUsers               bool   `yaml:"has_users"`
	UserCountEstimate      string `yaml:"user_count_estimate,omitempty"` // none | 1-10 | 10-100 | etc.
	PayingCustomers        bool   `yaml:"paying_customers"`
	CustomerFeedbackExists bool   `yaml:"customer_feedback_exists"`
}

type StrategicAssets struct {
	HasPositioning           bool `yaml:"has_positioning"`
	PositioningDocumented    bool `yaml:"positioning_documented"`
	CompetitorAnalysisExists bool `yaml:"competitor_analysis_exists"`
	InvestorMaterialsExist   bool `yaml:"investor_materials_exist"`
}

type ProcessAssets struct {
	HasDefinedProcess bool     `yaml:"has_defined_process"`
	ProcessTypes      []string `yaml:"process_types,omitempty"` // sprint_planning | okr_process | etc.
}

// ConstraintsAndAssumptions captures hard constraints and operating assumptions
type ConstraintsAndAssumptions struct {
	HardConstraints      []Constraint          `yaml:"hard_constraints,omitempty"`
	OperatingAssumptions []OperatingAssumption `yaml:"operating_assumptions,omitempty"`
	CapabilityGaps       []CapabilityGap       `yaml:"capability_gaps,omitempty"`
}

type Constraint struct {
	Constraint  string `yaml:"constraint"`
	Impact      string `yaml:"impact"`                // timeline | budget | scope | quality | team | regulatory
	Flexibility string `yaml:"flexibility,omitempty"` // none | negotiable_with_tradeoffs | soft_preference
}

type OperatingAssumption struct {
	Assumption string `yaml:"assumption"`
	Confidence string `yaml:"confidence,omitempty"` // high | medium | low
	Source     string `yaml:"source,omitempty"`
}

type CapabilityGap struct {
	Gap                string `yaml:"gap"`
	Track              string `yaml:"track,omitempty"`               // product | strategy | org_ops | commercial
	MitigationApproach string `yaml:"mitigation_approach,omitempty"` // hire | contractor | ai_augmentation | etc.
	MitigationStatus   string `yaml:"mitigation_status,omitempty"`   // planned | in_progress | resolved | deferred
}

// CurrentFocus captures where attention should go
type CurrentFocus struct {
	CycleReference      string         `yaml:"cycle_reference"`
	PrimaryTrack        string         `yaml:"primary_track"`             // product | strategy | org_ops | commercial
	SecondaryTrack      string         `yaml:"secondary_track,omitempty"` // product | strategy | org_ops | commercial | none
	PrimaryObjective    string         `yaml:"primary_objective"`
	SuccessSignals      []string       `yaml:"success_signals,omitempty"`
	AttentionAllocation map[string]int `yaml:"attention_allocation,omitempty"` // track -> percentage
}

// EvolutionEntry records a change to the LRA
type EvolutionEntry struct {
	CycleReference  string           `yaml:"cycle_reference"` // bootstrap | C1 | C2 | etc.
	Timestamp       *time.Time       `yaml:"timestamp,omitempty"`
	UpdatedBy       string           `yaml:"updated_by,omitempty"`
	Trigger         string           `yaml:"trigger"` // bootstrap_complete | aim_signals | external_change | etc.
	Summary         string           `yaml:"summary"`
	Changes         []ChangeDetail   `yaml:"changes"`
	SignalsSnapshot *SignalsSnapshot `yaml:"signals_snapshot,omitempty"`
}

type ChangeDetail struct {
	Section       string      `yaml:"section"` // metadata | adoption_context | track_baselines | etc.
	Field         string      `yaml:"field"`
	ChangeType    string      `yaml:"change_type"` // created | updated | removed
	PreviousValue interface{} `yaml:"previous_value,omitempty"`
	NewValue      interface{} `yaml:"new_value,omitempty"`
	Reason        string      `yaml:"reason,omitempty"`
}

type SignalsSnapshot struct {
	Product    *TrackSignals `yaml:"product,omitempty"`
	Strategy   *TrackSignals `yaml:"strategy,omitempty"`
	OrgOps     *TrackSignals `yaml:"org_ops,omitempty"`
	Commercial *TrackSignals `yaml:"commercial,omitempty"`
}

type TrackSignals struct {
	Velocity string `yaml:"velocity,omitempty"` // accelerating | stable | slowing | blocked
	Quality  string `yaml:"quality,omitempty"`  // excellent | healthy | degrading | critical
}

// ValidationResult captures validation errors
type ValidationResult struct {
	Valid  bool     `yaml:"valid"`
	Errors []string `yaml:"errors,omitempty"`
}

// InferenceContext holds data used to infer LRA from existing artifacts
type InferenceContext struct {
	MetaYAML        map[string]interface{}
	InstancePath    string
	READYArtifacts  []string
	FIREArtifacts   []string
	AIMArtifacts    []string
	FeatureCount    int
	HasValueModels  bool
	HasRoadmap      bool
	HasAssessments  bool
	CyclesCompleted int
	AdoptionLevel   int
}

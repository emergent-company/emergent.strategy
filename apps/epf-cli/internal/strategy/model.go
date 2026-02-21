// Package strategy provides in-memory access to EPF product strategy data.
// It enables AI agents to query strategic context without filesystem access.
package strategy

import "time"

// StrategyModel represents the complete in-memory model of an EPF instance's strategy.
// It aggregates data from READY phase artifacts (north_star, insight_analyses,
// strategy_foundations, strategy_formula, roadmap_recipe) and FIRE phase artifacts
// (definitions/product, value_models).
type StrategyModel struct {
	// InstancePath is the root path of the EPF instance
	InstancePath string

	// ProductName from _meta.yaml or _epf.yaml
	ProductName string

	// LastLoaded is when the model was last populated from disk
	LastLoaded time.Time

	// NorthStar contains vision, mission, purpose, and values
	NorthStar *NorthStar

	// InsightAnalyses contains trends, market analysis, and personas
	InsightAnalyses *InsightAnalyses

	// StrategyFormula contains positioning and competitive analysis
	StrategyFormula *StrategyFormula

	// Roadmap contains OKRs and key results organized by track
	Roadmap *Roadmap

	// Features maps feature ID to feature definition
	Features map[string]*Feature

	// ValueModels maps track name to value model
	ValueModels map[string]*ValueModel

	// --- Relationship Indexes (built on load) ---

	// PersonaToPainPoints maps persona ID to their pain points
	PersonaToPainPoints map[string][]PainPoint

	// PainPointToValueProps maps pain point descriptions to value propositions that address them
	PainPointToValueProps map[string][]ValueProposition

	// FeatureToPersonas maps feature ID to personas it serves
	FeatureToPersonas map[string][]string

	// ValuePathToFeatures maps value model path to features that contribute to it
	ValuePathToFeatures map[string][]string

	// TrackToOKRs maps track name to OKRs
	TrackToOKRs map[string][]OKR
}

// NorthStar represents the 00_north_star.yaml artifact.
// Contains the enduring strategic context that rarely changes.
type NorthStar struct {
	Organization string
	LastReviewed string
	NextReview   string
	Version      string

	Purpose Purpose
	Vision  Vision
	Mission Mission
	Values  []Value
}

// Purpose describes why the organization exists.
type Purpose struct {
	Statement      string
	ProblemWeSolve string
	WhoWeServe     string
	ImpactWeSeek   string
}

// Vision describes the future state the organization aims for.
type Vision struct {
	Statement        string
	Timeframe        string
	SuccessLooksLike []string
	NotTheVision     []string
}

// Mission describes what the organization does to deliver value.
type Mission struct {
	Statement    string
	WhatWeDo     []string
	HowWeDeliver HowWeDeliver
	WhoWeServe   string
	Boundaries   Boundaries
}

// HowWeDeliver describes the approach and key capabilities.
type HowWeDeliver struct {
	Approach        string
	KeyCapabilities []string
}

// Boundaries describes what the organization doesn't do.
type Boundaries struct {
	WeDontDo []string
	WhyNot   string
}

// Value represents a core organizational value.
type Value struct {
	Name              string
	Definition        string
	BehaviorsWeExpect []string
	BehaviorsWeReject []string
	ExampleDecision   string
}

// InsightAnalyses represents the 01_insight_analyses.yaml artifact.
type InsightAnalyses struct {
	LastUpdated     string
	ConfidenceLevel string
	NextReviewDate  string

	Trends      Trends
	KeyInsights []KeyInsight
	Market      MarketDefinition
	Segments    []MarketSegment
	TargetUsers []TargetUser
}

// Trends groups different types of market/technology trends.
type Trends struct {
	Technology   []Trend
	Market       []Trend
	UserBehavior []Trend
	Regulatory   []Trend
	Competitive  []Trend
}

// Trend represents a single market or technology trend.
type Trend struct {
	Name      string
	Timeframe string
	Impact    string
	Evidence  []string
}

// KeyInsight synthesizes multiple trends into a strategic implication.
type KeyInsight struct {
	Insight              string
	SupportingTrends     []string
	StrategicImplication string
}

// MarketDefinition describes TAM/SAM/SOM.
type MarketDefinition struct {
	TAM         MarketSize
	SAM         MarketSize
	SOM         MarketSize
	MarketStage string
	GrowthRate  string
}

// MarketSize represents a market sizing with methodology.
type MarketSize struct {
	Size              string
	Definition        string
	CalculationMethod string
	Timeframe         string
}

// MarketSegment describes a target market segment.
type MarketSegment struct {
	Name            string
	Size            string
	Characteristics []string
	UnmetNeeds      []string
}

// TargetUser represents a target user persona from insight analyses.
type TargetUser struct {
	ID                   string
	Name                 string
	Role                 string
	Description          string
	Goals                []string
	PainPoints           []string
	UsageContext         string
	TechnicalProficiency string
}

// PainPoint represents a specific pain point with severity and context.
type PainPoint struct {
	PersonaID   string
	PersonaName string
	Description string
	Category    string // optional categorization
}

// StrategyFormula represents the 04_strategy_formula.yaml artifact.
type StrategyFormula struct {
	ID            string
	OpportunityID string
	Title         string
	LastUpdated   string

	Positioning     Positioning
	CompetitiveMoat CompetitiveMoat
}

// Positioning describes how the product is positioned in the market.
type Positioning struct {
	UniqueValueProp   string
	TargetCustomer    string
	CategoryPosition  string
	Statement         string
	TaglineCandidates []string
}

// CompetitiveMoat describes competitive advantages.
type CompetitiveMoat struct {
	Advantages      []Advantage
	Differentiation string
	VsCompetitors   []CompetitorComparison
}

// Advantage represents a single competitive advantage.
type Advantage struct {
	Name          string
	Description   string
	Defensibility string
	Evidence      string
}

// CompetitorComparison compares against a specific competitor.
type CompetitorComparison struct {
	Competitor    string
	TheirStrength string
	OurAngle      string
	Wedge         string
	Category      string
}

// ValueProposition describes a value proposition that addresses pain points.
type ValueProposition struct {
	ID         string
	Statement  string
	PersonaIDs []string // personas this addresses
	PainPoints []string // pain points this solves
	Evidence   string
}

// Roadmap represents the 05_roadmap_recipe.yaml artifact.
type Roadmap struct {
	ID         string
	StrategyID string
	Cycle      int
	Timeframe  string

	Tracks map[string]*Track
}

// Track represents a single track (product, strategy, org_ops, commercial).
type Track struct {
	Name           string
	TrackObjective string
	OKRs           []OKR
}

// OKR represents an Objective with Key Results.
type OKR struct {
	ID         string
	TrackName  string
	Objective  string
	KeyResults []KeyResult
}

// KeyResult represents a measurable key result.
type KeyResult struct {
	ID                string
	OKRID             string
	Description       string
	Target            string
	MeasurementMethod string
	Baseline          string
	Status            string // completed, in_progress, planned
	CompletionDate    string

	// TRL tracking
	TRLStart       int
	TRLTarget      int
	TRLAchieved    int
	TRLProgression string

	// Hypothesis and experiment
	TechnicalHypothesis  string
	ExperimentDesign     string
	SuccessCriteria      string
	UncertaintyAddressed string

	// Value model connection
	ValueModelTarget string
}

// Feature represents a feature definition from fd-*.yaml.
type Feature struct {
	ID     string
	Name   string
	Slug   string
	Status string // draft, ready, in-progress, delivered

	StrategicContext StrategicContext
	Definition       FeatureDefinition
	Capabilities     []Capability
	FeatureMaturity  FeatureMaturity
}

// StrategicContext links a feature to value model and tracks.
type StrategicContext struct {
	ContributesTo     []string // value model paths
	Tracks            []string
	AssumptionsTested []string
}

// FeatureDefinition contains the core definition of a feature.
type FeatureDefinition struct {
	JobToBeDone      string
	SolutionApproach string
	Personas         []FeaturePersona
}

// FeaturePersona represents a persona specific to a feature.
type FeaturePersona struct {
	ID                   string
	Name                 string
	Role                 string
	Description          string
	Goals                []string
	PainPoints           []string
	UsageContext         string
	TechnicalProficiency string
	CurrentSituation     string
	TransformationMoment string
	EmotionalResolution  string
}

// Capability represents a discrete capability within a feature.
type Capability struct {
	ID          string
	Name        string
	Description string
}

// FeatureMaturity tracks the maturity of a feature and its capabilities.
type FeatureMaturity struct {
	OverallStage       string // hypothetical, emerging, proven, scaled
	CapabilityMaturity []CapabilityMaturity
	LastAdvancedByKR   string
	LastAssessmentDate string
}

// CapabilityMaturity tracks maturity of a single capability.
type CapabilityMaturity struct {
	CapabilityID  string
	Stage         string
	DeliveredByKR string
	Evidence      string
}

// ValueModel represents a track's value model.
type ValueModel struct {
	Track       string
	Description string
	Layers      []ValueLayer
}

// ValueLayer represents an L1 layer in the value model.
type ValueLayer struct {
	ID          string
	Name        string
	Description string
	Components  []ValueComponent
}

// ValueComponent represents an L2 component in the value model.
type ValueComponent struct {
	ID            string
	Name          string
	Description   string
	Maturity      string
	SubComponents []ValueSubComponent
}

// ValueSubComponent represents an L3 sub-component.
type ValueSubComponent struct {
	ID          string
	Name        string
	Description string
	Maturity    string
}

// SearchResult represents a search result with relevance scoring.
type SearchResult struct {
	// Type indicates what kind of result (persona, feature, insight, etc.)
	Type string

	// ID is the unique identifier (persona ID, feature ID, etc.)
	ID string

	// Title is the display name
	Title string

	// Content is the matched content
	Content string

	// Snippet is a highlighted excerpt showing the match
	Snippet string

	// Score is the relevance score (higher is more relevant)
	Score float64

	// Source is the artifact path where this was found
	Source string

	// Context provides additional context about the result
	Context map[string]string
}

// StrategicContextResult represents synthesized context for a topic.
type StrategicContextResult struct {
	// Topic is what context was requested for
	Topic string

	// Vision shows how this relates to the overall vision
	Vision string

	// RelevantPersonas lists personas affected by this topic
	RelevantPersonas []PersonaSummary

	// RelevantPainPoints lists pain points related to this topic
	RelevantPainPoints []PainPoint

	// RelevantFeatures lists features that address this topic
	RelevantFeatures []FeatureSummary

	// RelevantOKRs lists OKRs targeting this topic
	RelevantOKRs []OKRSummary

	// CompetitiveContext describes competitive positioning
	CompetitiveContext string

	// KeyInsights lists relevant strategic insights
	KeyInsights []string
}

// PersonaSummary is a brief summary of a persona.
type PersonaSummary struct {
	ID          string
	Name        string
	Role        string
	Description string
}

// FeatureSummary is a brief summary of a feature.
type FeatureSummary struct {
	ID            string
	Name          string
	Status        string
	ContributesTo []string
}

// OKRSummary is a brief summary of an OKR.
type OKRSummary struct {
	ID         string
	Track      string
	Objective  string
	KeyResults []string
}

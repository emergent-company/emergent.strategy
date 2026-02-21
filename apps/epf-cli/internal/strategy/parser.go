// Package strategy provides in-memory access to EPF product strategy data.
package strategy

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// Parser handles parsing of EPF YAML artifacts into the strategy model.
type Parser struct {
	instancePath string
	// discovered maps artifact types to file paths found during READY/ scan
	discovered map[string]string
}

// NewParser creates a new parser for the given EPF instance path.
func NewParser(instancePath string) *Parser {
	return &Parser{instancePath: instancePath}
}

// readyArtifactType identifies READY phase artifact types for content-based detection.
type readyArtifactType struct {
	name string
	// topLevelKeys are the YAML top-level keys that identify this artifact type.
	// The first match wins.
	topLevelKeys []string
	// filePatterns are filename substrings that identify this artifact type (fallback).
	filePatterns []string
}

// readyArtifactTypes defines how to identify READY phase artifacts by content or filename.
var readyArtifactTypes = []readyArtifactType{
	{
		name:         "north_star",
		topLevelKeys: []string{"north_star"},
		filePatterns: []string{"north_star", "north-star"},
	},
	{
		name:         "insight_analyses",
		topLevelKeys: []string{"target_users", "trends"},
		filePatterns: []string{"insight_analys", "insight-analys"},
	},
	{
		name:         "strategy_formula",
		topLevelKeys: []string{"strategy"},
		filePatterns: []string{"strategy_formula", "strategy-formula"},
	},
	{
		name:         "roadmap_recipe",
		topLevelKeys: []string{"roadmap"},
		filePatterns: []string{"roadmap_recipe", "roadmap-recipe", "roadmap"},
	},
}

// discoverReadyArtifacts scans READY/ for YAML files and classifies them by content.
// It checks top-level YAML keys first (content-based), then falls back to filename patterns.
// Results are cached in the parser for use by individual Parse methods.
func (p *Parser) discoverReadyArtifacts() map[string]string {
	if p.discovered != nil {
		return p.discovered
	}

	p.discovered = make(map[string]string)

	readyDir := filepath.Join(p.instancePath, "READY")
	entries, err := os.ReadDir(readyDir)
	if err != nil {
		return p.discovered
	}

	// Phase 1: Content-based detection using top-level YAML keys
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") {
			continue
		}

		filePath := filepath.Join(readyDir, entry.Name())
		topKeys := scanTopLevelKeys(filePath)
		if len(topKeys) == 0 {
			continue
		}

		for _, at := range readyArtifactTypes {
			if _, found := p.discovered[at.name]; found {
				continue // already discovered this type
			}
			for _, key := range at.topLevelKeys {
				if topKeys[key] {
					p.discovered[at.name] = filePath
					break
				}
			}
		}
	}

	// Phase 2: Filename-based fallback for any types not yet discovered
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") {
			continue
		}

		nameLower := strings.ToLower(entry.Name())
		for _, at := range readyArtifactTypes {
			if _, found := p.discovered[at.name]; found {
				continue
			}
			for _, pattern := range at.filePatterns {
				if strings.Contains(nameLower, pattern) {
					p.discovered[at.name] = filepath.Join(readyDir, entry.Name())
					break
				}
			}
		}
	}

	return p.discovered
}

// scanTopLevelKeys reads a YAML file and returns the set of top-level keys.
// This is lightweight — it only decodes the top level, not the full document.
func scanTopLevelKeys(path string) map[string]bool {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	var raw map[string]interface{}
	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil
	}

	keys := make(map[string]bool, len(raw))
	for k := range raw {
		keys[k] = true
	}
	return keys
}

// resolveReadyPath returns the discovered path for a READY artifact type,
// falling back to the traditional hardcoded path if not discovered.
func (p *Parser) resolveReadyPath(artifactType, hardcodedFilename string) string {
	discovered := p.discoverReadyArtifacts()
	if path, ok := discovered[artifactType]; ok {
		return path
	}
	return filepath.Join(p.instancePath, "READY", hardcodedFilename)
}

// ParseAll parses all EPF artifacts and returns a populated StrategyModel.
func (p *Parser) ParseAll() (*StrategyModel, error) {
	model := &StrategyModel{
		InstancePath:          p.instancePath,
		Features:              make(map[string]*Feature),
		ValueModels:           make(map[string]*ValueModel),
		PersonaToPainPoints:   make(map[string][]PainPoint),
		PainPointToValueProps: make(map[string][]ValueProposition),
		FeatureToPersonas:     make(map[string][]string),
		ValuePathToFeatures:   make(map[string][]string),
		TrackToOKRs:           make(map[string][]OKR),
	}

	// Parse product name from _epf.yaml or _meta.yaml
	productName, err := p.parseProductName()
	if err == nil {
		model.ProductName = productName
	}

	// Parse READY phase artifacts
	if ns, err := p.ParseNorthStar(); err == nil {
		model.NorthStar = ns
	}

	if ia, err := p.ParseInsightAnalyses(); err == nil {
		model.InsightAnalyses = ia
	}

	if sf, err := p.ParseStrategyFormula(); err == nil {
		model.StrategyFormula = sf
	}

	if rm, err := p.ParseRoadmap(); err == nil {
		model.Roadmap = rm
	}

	// Parse FIRE phase artifacts
	if features, err := p.ParseFeatures(); err == nil {
		for _, f := range features {
			model.Features[f.ID] = f
		}
	}

	if vms, err := p.ParseValueModels(); err == nil {
		for name, vm := range vms {
			model.ValueModels[name] = vm
		}
	}

	// Build relationship indexes
	p.buildIndexes(model)

	return model, nil
}

// parseProductName extracts the product name from anchor or meta file.
func (p *Parser) parseProductName() (string, error) {
	// Try _epf.yaml first
	epfPath := filepath.Join(p.instancePath, "_epf.yaml")
	if data, err := os.ReadFile(epfPath); err == nil {
		var anchor struct {
			ProductName string `yaml:"product_name"`
		}
		if err := yaml.Unmarshal(data, &anchor); err == nil && anchor.ProductName != "" {
			return anchor.ProductName, nil
		}
	}

	// Try _meta.yaml
	metaPath := filepath.Join(p.instancePath, "_meta.yaml")
	if data, err := os.ReadFile(metaPath); err == nil {
		var meta struct {
			ProductName string `yaml:"product_name"`
			Name        string `yaml:"name"`
		}
		if err := yaml.Unmarshal(data, &meta); err == nil {
			if meta.ProductName != "" {
				return meta.ProductName, nil
			}
			if meta.Name != "" {
				return meta.Name, nil
			}
		}
	}

	return "", fmt.Errorf("product name not found")
}

// ParseNorthStar parses the north star artifact, discovered by content or filename.
func (p *Parser) ParseNorthStar() (*NorthStar, error) {
	path := p.resolveReadyPath("north_star", "00_north_star.yaml")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading north_star: %w", err)
	}

	// The YAML has a top-level 'north_star' key
	var raw struct {
		NorthStar struct {
			Organization string `yaml:"organization"`
			LastReviewed string `yaml:"last_reviewed"`
			NextReview   string `yaml:"next_review"`
			Version      string `yaml:"version"`

			Purpose struct {
				Statement      string `yaml:"statement"`
				ProblemWeSolve string `yaml:"problem_we_solve"`
				WhoWeServe     string `yaml:"who_we_serve"`
				ImpactWeSeek   string `yaml:"impact_we_seek"`
			} `yaml:"purpose"`

			Vision struct {
				VisionStatement  string   `yaml:"vision_statement"`
				Timeframe        string   `yaml:"timeframe"`
				SuccessLooksLike []string `yaml:"success_looks_like"`
				NotTheVision     []string `yaml:"not_the_vision"`
			} `yaml:"vision"`

			Mission struct {
				MissionStatement string   `yaml:"mission_statement"`
				WhatWeDo         []string `yaml:"what_we_do"`
				HowWeDeliver     struct {
					Approach        string   `yaml:"approach"`
					KeyCapabilities []string `yaml:"key_capabilities"`
				} `yaml:"how_we_deliver"`
				WhoWeServeSpecifically string `yaml:"who_we_serve_specifically"`
				Boundaries             struct {
					WeDontDo []string `yaml:"we_dont_do"`
					WhyNot   string   `yaml:"why_not"`
				} `yaml:"boundaries"`
			} `yaml:"mission"`

			Values []struct {
				Value             string   `yaml:"value"`
				Definition        string   `yaml:"definition"`
				BehaviorsWeExpect []string `yaml:"behaviors_we_expect"`
				BehaviorsWeReject []string `yaml:"behaviors_we_reject"`
				ExampleDecision   string   `yaml:"example_decision"`
			} `yaml:"values"`
		} `yaml:"north_star"`
	}

	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parsing north_star: %w", err)
	}

	ns := &NorthStar{
		Organization: raw.NorthStar.Organization,
		LastReviewed: raw.NorthStar.LastReviewed,
		NextReview:   raw.NorthStar.NextReview,
		Version:      raw.NorthStar.Version,
		Purpose: Purpose{
			Statement:      raw.NorthStar.Purpose.Statement,
			ProblemWeSolve: raw.NorthStar.Purpose.ProblemWeSolve,
			WhoWeServe:     raw.NorthStar.Purpose.WhoWeServe,
			ImpactWeSeek:   raw.NorthStar.Purpose.ImpactWeSeek,
		},
		Vision: Vision{
			Statement:        raw.NorthStar.Vision.VisionStatement,
			Timeframe:        raw.NorthStar.Vision.Timeframe,
			SuccessLooksLike: raw.NorthStar.Vision.SuccessLooksLike,
			NotTheVision:     raw.NorthStar.Vision.NotTheVision,
		},
		Mission: Mission{
			Statement:  raw.NorthStar.Mission.MissionStatement,
			WhatWeDo:   raw.NorthStar.Mission.WhatWeDo,
			WhoWeServe: raw.NorthStar.Mission.WhoWeServeSpecifically,
			HowWeDeliver: HowWeDeliver{
				Approach:        raw.NorthStar.Mission.HowWeDeliver.Approach,
				KeyCapabilities: raw.NorthStar.Mission.HowWeDeliver.KeyCapabilities,
			},
			Boundaries: Boundaries{
				WeDontDo: raw.NorthStar.Mission.Boundaries.WeDontDo,
				WhyNot:   raw.NorthStar.Mission.Boundaries.WhyNot,
			},
		},
	}

	// Convert values
	for _, v := range raw.NorthStar.Values {
		ns.Values = append(ns.Values, Value{
			Name:              v.Value,
			Definition:        v.Definition,
			BehaviorsWeExpect: v.BehaviorsWeExpect,
			BehaviorsWeReject: v.BehaviorsWeReject,
			ExampleDecision:   v.ExampleDecision,
		})
	}

	return ns, nil
}

// ParseInsightAnalyses parses the insight analyses artifact, discovered by content or filename.
func (p *Parser) ParseInsightAnalyses() (*InsightAnalyses, error) {
	path := p.resolveReadyPath("insight_analyses", "01_insight_analyses.yaml")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading insight_analyses: %w", err)
	}

	var raw struct {
		LastUpdated     string `yaml:"last_updated"`
		ConfidenceLevel string `yaml:"confidence_level"`
		NextReviewDate  string `yaml:"next_review_date"`

		Trends struct {
			Technology   []rawTrend `yaml:"technology"`
			Market       []rawTrend `yaml:"market"`
			UserBehavior []rawTrend `yaml:"user_behavior"`
			Regulatory   []rawTrend `yaml:"regulatory"`
			Competitive  []rawTrend `yaml:"competitive"`
		} `yaml:"trends"`

		KeyInsights []struct {
			Insight              string   `yaml:"insight"`
			SupportingTrends     []string `yaml:"supporting_trends"`
			StrategicImplication string   `yaml:"strategic_implication"`
		} `yaml:"key_insights"`

		MarketDefinition struct {
			TAM struct {
				Size              string `yaml:"size"`
				CalculationMethod string `yaml:"calculation_method"`
			} `yaml:"tam"`
			SAM struct {
				Size       string `yaml:"size"`
				Definition string `yaml:"definition"`
			} `yaml:"sam"`
			SOM struct {
				Size      string `yaml:"size"`
				Timeframe string `yaml:"timeframe"`
			} `yaml:"som"`
			MarketStage string `yaml:"market_stage"`
			GrowthRate  string `yaml:"growth_rate"`
		} `yaml:"market_definition"`

		MarketStructure struct {
			Segments []struct {
				Segment         string   `yaml:"segment"`
				Size            string   `yaml:"size"`
				Characteristics []string `yaml:"characteristics"`
				UnmetNeeds      []string `yaml:"unmet_needs"`
			} `yaml:"segments"`
		} `yaml:"market_structure"`

		TargetUsers []rawTargetUser `yaml:"target_users"`
	}

	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parsing insight_analyses: %w", err)
	}

	ia := &InsightAnalyses{
		LastUpdated:     raw.LastUpdated,
		ConfidenceLevel: raw.ConfidenceLevel,
		NextReviewDate:  raw.NextReviewDate,
		Trends: Trends{
			Technology:   convertTrends(raw.Trends.Technology),
			Market:       convertTrends(raw.Trends.Market),
			UserBehavior: convertTrends(raw.Trends.UserBehavior),
			Regulatory:   convertTrends(raw.Trends.Regulatory),
			Competitive:  convertTrends(raw.Trends.Competitive),
		},
		Market: MarketDefinition{
			TAM: MarketSize{
				Size:              raw.MarketDefinition.TAM.Size,
				CalculationMethod: raw.MarketDefinition.TAM.CalculationMethod,
			},
			SAM: MarketSize{
				Size:       raw.MarketDefinition.SAM.Size,
				Definition: raw.MarketDefinition.SAM.Definition,
			},
			SOM: MarketSize{
				Size:      raw.MarketDefinition.SOM.Size,
				Timeframe: raw.MarketDefinition.SOM.Timeframe,
			},
			MarketStage: raw.MarketDefinition.MarketStage,
			GrowthRate:  raw.MarketDefinition.GrowthRate,
		},
	}

	// Convert key insights
	for _, ki := range raw.KeyInsights {
		ia.KeyInsights = append(ia.KeyInsights, KeyInsight{
			Insight:              ki.Insight,
			SupportingTrends:     ki.SupportingTrends,
			StrategicImplication: ki.StrategicImplication,
		})
	}

	// Convert market segments
	for _, seg := range raw.MarketStructure.Segments {
		ia.Segments = append(ia.Segments, MarketSegment{
			Name:            seg.Segment,
			Size:            seg.Size,
			Characteristics: seg.Characteristics,
			UnmetNeeds:      seg.UnmetNeeds,
		})
	}

	// Convert target users
	for _, tu := range raw.TargetUsers {
		ia.TargetUsers = append(ia.TargetUsers, convertTargetUser(tu))
	}

	return ia, nil
}

// rawTrend is the YAML structure for a trend.
type rawTrend struct {
	Trend     string   `yaml:"trend"`
	Timeframe string   `yaml:"timeframe"`
	Impact    string   `yaml:"impact"`
	Evidence  []string `yaml:"evidence"`
}

func convertTrends(raw []rawTrend) []Trend {
	var trends []Trend
	for _, r := range raw {
		trends = append(trends, Trend{
			Name:      r.Trend,
			Timeframe: r.Timeframe,
			Impact:    r.Impact,
			Evidence:  r.Evidence,
		})
	}
	return trends
}

// rawTargetUser is the YAML structure for a target user.
type rawTargetUser struct {
	Persona      string `yaml:"persona"`
	Description  string `yaml:"description"`
	CurrentState struct {
		Goals     []string `yaml:"goals"`
		Context   string   `yaml:"context"`
		Frequency string   `yaml:"frequency"`
	} `yaml:"current_state"`
	Problems []struct {
		Problem         string   `yaml:"problem"`
		Severity        string   `yaml:"severity"`
		Frequency       string   `yaml:"frequency"`
		CurrentSolution string   `yaml:"current_solution"`
		Workarounds     []string `yaml:"workarounds"`
	} `yaml:"problems"`
}

func convertTargetUser(raw rawTargetUser) TargetUser {
	tu := TargetUser{
		Name:         raw.Persona,
		Description:  raw.Description,
		UsageContext: raw.CurrentState.Context,
	}
	tu.Goals = raw.CurrentState.Goals

	// Extract pain points from problems
	for _, prob := range raw.Problems {
		tu.PainPoints = append(tu.PainPoints, prob.Problem)
	}

	return tu
}

// ParseStrategyFormula parses the strategy formula artifact, discovered by content or filename.
func (p *Parser) ParseStrategyFormula() (*StrategyFormula, error) {
	path := p.resolveReadyPath("strategy_formula", "04_strategy_formula.yaml")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading strategy_formula: %w", err)
	}

	var raw struct {
		Strategy struct {
			ID            string `yaml:"id"`
			OpportunityID string `yaml:"opportunity_id"`
			Title         string `yaml:"title"`
			LastUpdated   string `yaml:"last_updated"`

			Positioning struct {
				UniqueValueProp   string   `yaml:"unique_value_proposition"`
				TargetCustomer    string   `yaml:"target_customer_profile"`
				CategoryPosition  string   `yaml:"category_position"`
				PositionStatement string   `yaml:"positioning_statement"`
				TaglineCandidates []string `yaml:"tagline_candidates"`
			} `yaml:"positioning"`

			CompetitiveMoat struct {
				Advantages []struct {
					Name          string `yaml:"name"`
					Description   string `yaml:"description"`
					Defensibility string `yaml:"defensibility"`
					Evidence      string `yaml:"evidence"`
				} `yaml:"advantages"`
				Differentiation string `yaml:"differentiation"`
				VsCompetitors   []struct {
					Competitor    string `yaml:"competitor"`
					TheirStrength string `yaml:"their_strength"`
					OurAngle      string `yaml:"our_angle"`
					Wedge         string `yaml:"wedge"`
					Category      string `yaml:"category"`
				} `yaml:"vs_competitors"`
			} `yaml:"competitive_moat"`
		} `yaml:"strategy"`
	}

	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parsing strategy_formula: %w", err)
	}

	sf := &StrategyFormula{
		ID:            raw.Strategy.ID,
		OpportunityID: raw.Strategy.OpportunityID,
		Title:         raw.Strategy.Title,
		LastUpdated:   raw.Strategy.LastUpdated,
		Positioning: Positioning{
			UniqueValueProp:   raw.Strategy.Positioning.UniqueValueProp,
			TargetCustomer:    raw.Strategy.Positioning.TargetCustomer,
			CategoryPosition:  raw.Strategy.Positioning.CategoryPosition,
			Statement:         raw.Strategy.Positioning.PositionStatement,
			TaglineCandidates: raw.Strategy.Positioning.TaglineCandidates,
		},
		CompetitiveMoat: CompetitiveMoat{
			Differentiation: raw.Strategy.CompetitiveMoat.Differentiation,
		},
	}

	// Convert advantages
	for _, adv := range raw.Strategy.CompetitiveMoat.Advantages {
		sf.CompetitiveMoat.Advantages = append(sf.CompetitiveMoat.Advantages, Advantage{
			Name:          adv.Name,
			Description:   adv.Description,
			Defensibility: adv.Defensibility,
			Evidence:      adv.Evidence,
		})
	}

	// Convert competitor comparisons
	for _, comp := range raw.Strategy.CompetitiveMoat.VsCompetitors {
		sf.CompetitiveMoat.VsCompetitors = append(sf.CompetitiveMoat.VsCompetitors, CompetitorComparison{
			Competitor:    comp.Competitor,
			TheirStrength: comp.TheirStrength,
			OurAngle:      comp.OurAngle,
			Wedge:         comp.Wedge,
			Category:      comp.Category,
		})
	}

	return sf, nil
}

// ParseRoadmap parses the roadmap recipe artifact, discovered by content or filename.
func (p *Parser) ParseRoadmap() (*Roadmap, error) {
	path := p.resolveReadyPath("roadmap_recipe", "05_roadmap_recipe.yaml")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading roadmap_recipe: %w", err)
	}

	var raw struct {
		Roadmap struct {
			ID         string `yaml:"id"`
			StrategyID string `yaml:"strategy_id"`
			Cycle      int    `yaml:"cycle"`
			Timeframe  string `yaml:"timeframe"`

			Tracks struct {
				Product    rawTrack `yaml:"product"`
				Strategy   rawTrack `yaml:"strategy"`
				OrgOps     rawTrack `yaml:"org_ops"`
				Commercial rawTrack `yaml:"commercial"`
			} `yaml:"tracks"`
		} `yaml:"roadmap"`
	}

	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parsing roadmap_recipe: %w", err)
	}

	rm := &Roadmap{
		ID:         raw.Roadmap.ID,
		StrategyID: raw.Roadmap.StrategyID,
		Cycle:      raw.Roadmap.Cycle,
		Timeframe:  raw.Roadmap.Timeframe,
		Tracks:     make(map[string]*Track),
	}

	// Convert tracks
	if track := convertTrack("product", raw.Roadmap.Tracks.Product); track != nil {
		rm.Tracks["product"] = track
	}
	if track := convertTrack("strategy", raw.Roadmap.Tracks.Strategy); track != nil {
		rm.Tracks["strategy"] = track
	}
	if track := convertTrack("org_ops", raw.Roadmap.Tracks.OrgOps); track != nil {
		rm.Tracks["org_ops"] = track
	}
	if track := convertTrack("commercial", raw.Roadmap.Tracks.Commercial); track != nil {
		rm.Tracks["commercial"] = track
	}

	return rm, nil
}

// rawTrack is the YAML structure for a track.
type rawTrack struct {
	TrackObjective string   `yaml:"track_objective"`
	OKRs           []rawOKR `yaml:"okrs"`
}

// rawOKR is the YAML structure for an OKR.
type rawOKR struct {
	ID         string         `yaml:"id"`
	Objective  string         `yaml:"objective"`
	KeyResults []rawKeyResult `yaml:"key_results"`
}

// rawKeyResult is the YAML structure for a key result.
type rawKeyResult struct {
	ID                   string `yaml:"id"`
	Description          string `yaml:"description"`
	Target               string `yaml:"target"`
	MeasurementMethod    string `yaml:"measurement_method"`
	Baseline             string `yaml:"baseline"`
	Status               string `yaml:"status"`
	CompletionDate       string `yaml:"completion_date"`
	TRLStart             int    `yaml:"trl_start"`
	TRLTarget            int    `yaml:"trl_target"`
	TRLAchieved          int    `yaml:"trl_achieved"`
	TRLProgression       string `yaml:"trl_progression"`
	TechnicalHypothesis  string `yaml:"technical_hypothesis"`
	ExperimentDesign     string `yaml:"experiment_design"`
	SuccessCriteria      string `yaml:"success_criteria"`
	UncertaintyAddressed string `yaml:"uncertainty_addressed"`
}

func convertTrack(name string, raw rawTrack) *Track {
	if raw.TrackObjective == "" && len(raw.OKRs) == 0 {
		return nil
	}

	track := &Track{
		Name:           name,
		TrackObjective: raw.TrackObjective,
	}

	for _, okr := range raw.OKRs {
		convertedOKR := OKR{
			ID:        okr.ID,
			TrackName: name,
			Objective: okr.Objective,
		}

		for _, kr := range okr.KeyResults {
			convertedOKR.KeyResults = append(convertedOKR.KeyResults, KeyResult{
				ID:                   kr.ID,
				OKRID:                okr.ID,
				Description:          kr.Description,
				Target:               kr.Target,
				MeasurementMethod:    kr.MeasurementMethod,
				Baseline:             kr.Baseline,
				Status:               kr.Status,
				CompletionDate:       kr.CompletionDate,
				TRLStart:             kr.TRLStart,
				TRLTarget:            kr.TRLTarget,
				TRLAchieved:          kr.TRLAchieved,
				TRLProgression:       kr.TRLProgression,
				TechnicalHypothesis:  kr.TechnicalHypothesis,
				ExperimentDesign:     kr.ExperimentDesign,
				SuccessCriteria:      kr.SuccessCriteria,
				UncertaintyAddressed: kr.UncertaintyAddressed,
			})
		}

		track.OKRs = append(track.OKRs, convertedOKR)
	}

	return track
}

// ParseFeatures parses all feature definition files from FIRE/definitions/product/.
// Uses content-based detection: any YAML file with 'id', 'strategic_context', and 'definition'
// top-level keys is treated as a feature definition. Falls back to fd-*.yaml filename pattern.
func (p *Parser) ParseFeatures() ([]*Feature, error) {
	fdDir := filepath.Join(p.instancePath, "FIRE", "definitions", "product")
	entries, err := os.ReadDir(fdDir)
	if err != nil {
		return nil, fmt.Errorf("reading definitions/product directory: %w", err)
	}

	var features []*Feature
	loaded := make(map[string]bool) // track loaded files to avoid duplicates

	// Phase 1: Content-based detection — load any YAML with feature definition keys
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") {
			continue
		}

		path := filepath.Join(fdDir, entry.Name())
		if isFeatureDefinitionContent(path) {
			feature, err := p.parseFeatureFile(path)
			if err != nil {
				continue
			}
			features = append(features, feature)
			loaded[entry.Name()] = true
		}
	}

	// Phase 2: Filename fallback — load fd-*.yaml files not already loaded
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") {
			continue
		}
		if loaded[entry.Name()] {
			continue
		}
		if !strings.HasPrefix(entry.Name(), "fd-") {
			continue
		}

		path := filepath.Join(fdDir, entry.Name())
		feature, err := p.parseFeatureFile(path)
		if err != nil {
			continue
		}
		features = append(features, feature)
	}

	return features, nil
}

// isFeatureDefinitionContent checks if a YAML file has feature definition top-level keys.
func isFeatureDefinitionContent(path string) bool {
	keys := scanTopLevelKeys(path)
	if keys == nil {
		return false
	}
	// A feature definition has id, strategic_context, and definition at the top level
	return keys["id"] && keys["strategic_context"] && keys["definition"]
}

func (p *Parser) parseFeatureFile(path string) (*Feature, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading feature file: %w", err)
	}

	var raw struct {
		ID     string `yaml:"id"`
		Name   string `yaml:"name"`
		Slug   string `yaml:"slug"`
		Status string `yaml:"status"`

		StrategicContext struct {
			ContributesTo     []string `yaml:"contributes_to"`
			Tracks            []string `yaml:"tracks"`
			AssumptionsTested []string `yaml:"assumptions_tested"`
		} `yaml:"strategic_context"`

		Definition struct {
			JobToBeDone      string              `yaml:"job_to_be_done"`
			SolutionApproach string              `yaml:"solution_approach"`
			Personas         []rawFeaturePersona `yaml:"personas"`
		} `yaml:"definition"`

		Implementation struct {
			Capabilities []struct {
				ID          string `yaml:"id"`
				Name        string `yaml:"name"`
				Description string `yaml:"description"`
			} `yaml:"capabilities"`
		} `yaml:"implementation"`

		FeatureMaturity struct {
			OverallStage       string `yaml:"overall_stage"`
			CapabilityMaturity []struct {
				CapabilityID  string `yaml:"capability_id"`
				Stage         string `yaml:"stage"`
				DeliveredByKR string `yaml:"delivered_by_kr"`
				Evidence      string `yaml:"evidence"`
			} `yaml:"capability_maturity"`
			LastAdvancedByKR   string `yaml:"last_advanced_by_kr"`
			LastAssessmentDate string `yaml:"last_assessment_date"`
		} `yaml:"feature_maturity"`
	}

	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil, fmt.Errorf("parsing feature file: %w", err)
	}

	feature := &Feature{
		ID:     raw.ID,
		Name:   raw.Name,
		Slug:   raw.Slug,
		Status: raw.Status,
		StrategicContext: StrategicContext{
			ContributesTo:     raw.StrategicContext.ContributesTo,
			Tracks:            raw.StrategicContext.Tracks,
			AssumptionsTested: raw.StrategicContext.AssumptionsTested,
		},
		Definition: FeatureDefinition{
			JobToBeDone:      raw.Definition.JobToBeDone,
			SolutionApproach: raw.Definition.SolutionApproach,
		},
		FeatureMaturity: FeatureMaturity{
			OverallStage:       raw.FeatureMaturity.OverallStage,
			LastAdvancedByKR:   raw.FeatureMaturity.LastAdvancedByKR,
			LastAssessmentDate: raw.FeatureMaturity.LastAssessmentDate,
		},
	}

	// Convert personas
	for _, persona := range raw.Definition.Personas {
		feature.Definition.Personas = append(feature.Definition.Personas, convertFeaturePersona(persona))
	}

	// Convert capabilities
	for _, cap := range raw.Implementation.Capabilities {
		feature.Capabilities = append(feature.Capabilities, Capability{
			ID:          cap.ID,
			Name:        cap.Name,
			Description: cap.Description,
		})
	}

	// Convert capability maturity
	for _, cm := range raw.FeatureMaturity.CapabilityMaturity {
		feature.FeatureMaturity.CapabilityMaturity = append(feature.FeatureMaturity.CapabilityMaturity, CapabilityMaturity{
			CapabilityID:  cm.CapabilityID,
			Stage:         cm.Stage,
			DeliveredByKR: cm.DeliveredByKR,
			Evidence:      cm.Evidence,
		})
	}

	return feature, nil
}

// rawFeaturePersona is the YAML structure for a feature persona.
type rawFeaturePersona struct {
	ID                   string   `yaml:"id"`
	Name                 string   `yaml:"name"`
	Role                 string   `yaml:"role"`
	Description          string   `yaml:"description"`
	Goals                []string `yaml:"goals"`
	PainPoints           []string `yaml:"pain_points"`
	UsageContext         string   `yaml:"usage_context"`
	TechnicalProficiency string   `yaml:"technical_proficiency"`
	CurrentSituation     string   `yaml:"current_situation"`
	TransformationMoment string   `yaml:"transformation_moment"`
	EmotionalResolution  string   `yaml:"emotional_resolution"`
}

func convertFeaturePersona(raw rawFeaturePersona) FeaturePersona {
	return FeaturePersona{
		ID:                   raw.ID,
		Name:                 raw.Name,
		Role:                 raw.Role,
		Description:          raw.Description,
		Goals:                raw.Goals,
		PainPoints:           raw.PainPoints,
		UsageContext:         raw.UsageContext,
		TechnicalProficiency: raw.TechnicalProficiency,
		CurrentSituation:     raw.CurrentSituation,
		TransformationMoment: raw.TransformationMoment,
		EmotionalResolution:  raw.EmotionalResolution,
	}
}

// ParseValueModels parses all value model files from FIRE/value_models/.
// Uses content-based detection: any YAML file with a 'value_model' top-level key
// is treated as a value model. Falls back to *value_model* filename pattern.
func (p *Parser) ParseValueModels() (map[string]*ValueModel, error) {
	vmDir := filepath.Join(p.instancePath, "FIRE", "value_models")
	entries, err := os.ReadDir(vmDir)
	if err != nil {
		// Value models directory is optional
		return make(map[string]*ValueModel), nil
	}

	valueModels := make(map[string]*ValueModel)
	loaded := make(map[string]bool) // track loaded files to avoid duplicates

	// Phase 1: Content-based detection — load any YAML with 'track_name' + 'layers' keys
	// (value model files use flat top-level structure: track_name, version, status, layers)
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") {
			continue
		}

		path := filepath.Join(vmDir, entry.Name())
		keys := scanTopLevelKeys(path)
		if keys != nil && keys["track_name"] && keys["layers"] {
			vm, trackName, err := p.parseValueModelFile(path)
			if err != nil {
				continue
			}
			valueModels[trackName] = vm
			loaded[entry.Name()] = true
		}
	}

	// Phase 2: Filename fallback — load *value_model* files not already loaded
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") {
			continue
		}
		if loaded[entry.Name()] {
			continue
		}
		if !strings.Contains(entry.Name(), "value_model") {
			continue
		}

		path := filepath.Join(vmDir, entry.Name())
		vm, trackName, err := p.parseValueModelFile(path)
		if err != nil {
			continue
		}
		valueModels[trackName] = vm
	}

	return valueModels, nil
}

func (p *Parser) parseValueModelFile(path string) (*ValueModel, string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, "", fmt.Errorf("reading value model file: %w", err)
	}

	// Value model YAML files use flat top-level structure (no wrapper key):
	//   track_name: "Product"
	//   version: "1.1.0"
	//   layers:
	//     - id: ...
	var raw struct {
		TrackName   string `yaml:"track_name"`
		Description string `yaml:"description"`
		Layers      []struct {
			ID          string `yaml:"id"`
			Name        string `yaml:"name"`
			Description string `yaml:"description"`
			Components  []struct {
				ID            string `yaml:"id"`
				Name          string `yaml:"name"`
				Description   string `yaml:"description"`
				Maturity      string `yaml:"maturity"`
				SubComponents []struct {
					ID          string `yaml:"id"`
					Name        string `yaml:"name"`
					Description string `yaml:"description"`
					Maturity    string `yaml:"maturity"`
				} `yaml:"sub_components"`
			} `yaml:"components"`
		} `yaml:"layers"`
	}

	if err := yaml.Unmarshal(data, &raw); err != nil {
		return nil, "", fmt.Errorf("parsing value model: %w", err)
	}

	vm := &ValueModel{
		Track:       raw.TrackName,
		Description: raw.Description,
	}

	for _, layer := range raw.Layers {
		vl := ValueLayer{
			ID:          layer.ID,
			Name:        layer.Name,
			Description: layer.Description,
		}

		for _, comp := range layer.Components {
			vc := ValueComponent{
				ID:          comp.ID,
				Name:        comp.Name,
				Description: comp.Description,
				Maturity:    comp.Maturity,
			}

			for _, sub := range comp.SubComponents {
				vc.SubComponents = append(vc.SubComponents, ValueSubComponent{
					ID:          sub.ID,
					Name:        sub.Name,
					Description: sub.Description,
					Maturity:    sub.Maturity,
				})
			}

			vl.Components = append(vl.Components, vc)
		}

		vm.Layers = append(vm.Layers, vl)
	}

	return vm, vm.Track, nil
}

// buildIndexes builds relationship indexes for efficient queries.
func (p *Parser) buildIndexes(model *StrategyModel) {
	// Index personas to pain points
	if model.InsightAnalyses != nil {
		for _, tu := range model.InsightAnalyses.TargetUsers {
			for _, pp := range tu.PainPoints {
				model.PersonaToPainPoints[tu.ID] = append(model.PersonaToPainPoints[tu.ID], PainPoint{
					PersonaID:   tu.ID,
					PersonaName: tu.Name,
					Description: pp,
				})
			}
		}
	}

	// Index features to personas and value paths
	for _, feature := range model.Features {
		// Feature to personas
		for _, persona := range feature.Definition.Personas {
			model.FeatureToPersonas[feature.ID] = append(model.FeatureToPersonas[feature.ID], persona.ID)
		}

		// Value path to features
		for _, path := range feature.StrategicContext.ContributesTo {
			model.ValuePathToFeatures[path] = append(model.ValuePathToFeatures[path], feature.ID)
		}
	}

	// Index track to OKRs
	if model.Roadmap != nil {
		for trackName, track := range model.Roadmap.Tracks {
			model.TrackToOKRs[trackName] = track.OKRs
		}
	}
}

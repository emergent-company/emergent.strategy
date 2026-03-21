// Package decompose converts EPF YAML artifacts into section-level graph objects
// and structural edges for ingestion into emergent.memory.
//
// The decomposer owns its own YAML parsing — it reads raw YAML files directly,
// independent of the strategy parser package. This eliminates coupling to the
// strategy parser's Go structs and ensures the decomposer extracts everything
// the graph needs (core beliefs, assumptions, capabilities, dependencies)
// without workarounds for parser gaps.
//
// Mapping from EPF sections to epf-engine schema v2 object types:
//
//	North Star purpose/vision/mission/values/core_beliefs → Belief (tier 1)
//	Trends, personas, pain points → Trend, PainPoint, Persona (tier 2)
//	Positioning, competitive moat → Positioning (tier 3)
//	OKRs, key results, assumptions → OKR, Assumption (tier 4)
//	Value model components → ValueModelComponent (tier 5)
//	Features, scenarios → Feature, Scenario (tier 6)
//	Capabilities → Capability (tier 7)
//
// Each EPF YAML file also gets an Artifact node that contains its section-level children.
//
// Supported EPF versions: 2.x (will warn for unknown versions).
package decompose

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
	"gopkg.in/yaml.v3"
)

// MaxSupportedMajorVersion is the highest EPF major version the decomposer knows about.
// If an instance reports a higher version, decomposition still runs but emits a warning.
const MaxSupportedMajorVersion = 2

// Result holds the complete decomposition output — objects and relationships
// ready for upsert into emergent.memory.
type Result struct {
	Objects           []memory.UpsertObjectRequest
	Relationships     []RelationshipSpec
	Warnings          []string
	EvidenceDocuments []EvidenceDocument // Evidence files for content upload by the ingester
}

// RelationshipSpec describes a relationship to create, using object keys
// (not IDs) so it can be resolved after upsert.
type RelationshipSpec struct {
	Type       string
	FromKey    string // object key (Type:stable_id)
	FromType   string // object type name
	ToKey      string // object key
	ToType     string // object type name
	Properties map[string]any
}

// Decomposer converts an EPF instance directory into graph objects and relationships.
// It reads raw YAML files directly — no dependency on the strategy parser package.
type Decomposer struct {
	instancePath string
}

// New creates a Decomposer for the given EPF instance path.
func New(instancePath string) *Decomposer {
	return &Decomposer{instancePath: instancePath}
}

// DecomposeInstance reads all YAML files from the instance and produces
// graph objects and structural edges.
func (d *Decomposer) DecomposeInstance() (*Result, error) {
	result := &Result{}

	// Check EPF version
	d.checkVersion(result)

	// READY phase artifacts
	d.decomposeNorthStar(result)
	d.decomposeInsightAnalyses(result)
	d.decomposeInsightAnalysesExpanded(result) // Phase 1a: remaining 16 sections
	d.decomposeStrategyFoundations(result)     // Phase 1c: vision, value prop, sequencing
	d.decomposeInsightOpportunity(result)      // Phase 1c: validated opportunity
	d.decomposeStrategyFormula(result)
	d.decomposeStrategyFormulaExpanded(result) // Phase 1b: remaining 6 sections
	d.decomposeRoadmap(result)

	// FIRE phase artifacts
	d.decomposeFeatures(result)
	d.decomposeValueModels(result)
	d.decomposeMappings(result)         // Phase 1d: value model → implementation mappings
	d.decomposeTrackDefinitions(result) // Phase 2: strategy, org_ops, commercial definitions

	// AIM phase: evidence library
	d.decomposeEvidence(result)

	// Cross-cutting structural relationships (require multiple artifacts to be decomposed first)
	d.addInformsEdges(result)
	d.addConstrainsEdges(result)
	d.addValidatesEdges(result)
	d.addSharedTechnologyEdges(result)

	// Phase 3: Cross-artifact relationships (text matching and ID refs)
	d.addCompetesWithEdges(result)
	d.addValidatesHypothesisEdges(result)
	d.addMitigatesEdges(result)
	d.addLeveragesEdges(result)
	d.addTargetsSegmentEdges(result)
	d.addAddressesWhiteSpaceEdges(result)
	d.addRelatedDefinitionEdges(result)

	return result, nil
}

// --- Internal helpers ---

func (d *Decomposer) readYAML(relPath string, out any) error {
	data, err := os.ReadFile(filepath.Join(d.instancePath, relPath))
	if err != nil {
		return err
	}
	return yaml.Unmarshal(data, out)
}

func objectKey(objType, id string) string {
	return fmt.Sprintf("%s:%s", objType, id)
}

func artifactKey(filePath string) string {
	return objectKey("Artifact", filePath)
}

func (d *Decomposer) addObject(result *Result, obj memory.UpsertObjectRequest) {
	result.Objects = append(result.Objects, obj)
}

func (d *Decomposer) addContains(result *Result, parentKey, parentType, childKey, childType string) {
	result.Relationships = append(result.Relationships, RelationshipSpec{
		Type: "contains", FromKey: parentKey, FromType: parentType,
		ToKey: childKey, ToType: childType,
		Properties: map[string]any{"weight": "1.0", "edge_source": "structural"},
	})
}

func (d *Decomposer) addRel(result *Result, relType, fromKey, fromType, toKey, toType string, props map[string]any) {
	result.Relationships = append(result.Relationships, RelationshipSpec{
		Type: relType, FromKey: fromKey, FromType: fromType,
		ToKey: toKey, ToType: toType, Properties: props,
	})
}

func (d *Decomposer) addArtifactNode(result *Result, fileName, artifactType, phase, description, inertiaTier string) string {
	key := artifactKey(fileName)
	d.addObject(result, memory.UpsertObjectRequest{
		Type: "Artifact", Key: key,
		Properties: map[string]any{
			"name": fileName, "description": description,
			"artifact_type": artifactType, "phase": phase,
			"file_path": fileName, "inertia_tier": inertiaTier,
		},
	})
	return key
}

func (d *Decomposer) warn(result *Result, msg string) {
	result.Warnings = append(result.Warnings, msg)
	log.Printf("[decompose] WARNING: %s", msg)
}

// --- Version check ---

func (d *Decomposer) checkVersion(result *Result) {
	// Try _epf.yaml first, then _meta.yaml
	type anchor struct {
		EPFVersion string `yaml:"epf_version"`
	}
	var a anchor
	if err := d.readYAML("_epf.yaml", &a); err != nil {
		// Try _meta.yaml
		type meta struct {
			EPFVersion string `yaml:"epf_version"`
		}
		var m meta
		if err := d.readYAML("_meta.yaml", &m); err == nil {
			a.EPFVersion = m.EPFVersion
		}
	}
	if a.EPFVersion == "" {
		return
	}
	// Parse major version
	parts := strings.SplitN(a.EPFVersion, ".", 2)
	if len(parts) > 0 {
		var major int
		if _, err := fmt.Sscanf(parts[0], "%d", &major); err == nil && major > MaxSupportedMajorVersion {
			d.warn(result, fmt.Sprintf(
				"Instance EPF version %s is newer than decomposer supports (max %d.x). Some sections may not be decomposed.",
				a.EPFVersion, MaxSupportedMajorVersion))
		}
	}
}

// ============================================================
// READY/00_north_star.yaml
// ============================================================

type rawNorthStar struct {
	NorthStar struct {
		Purpose struct {
			Statement      string `yaml:"statement"`
			ProblemWeSolve string `yaml:"problem_we_solve"`
			WhoWeServe     string `yaml:"who_we_serve"`
			ImpactWeSeek   string `yaml:"impact_we_seek"`
		} `yaml:"purpose"`
		Vision struct {
			Statement        string   `yaml:"vision_statement"`
			Timeframe        string   `yaml:"timeframe"`
			SuccessLooksLike []string `yaml:"success_looks_like"`
		} `yaml:"vision"`
		Mission struct {
			Statement  string   `yaml:"mission_statement"`
			WhatWeDo   []string `yaml:"what_we_do"`
			HowDeliver struct {
				Approach string `yaml:"approach"`
			} `yaml:"how_we_deliver"`
		} `yaml:"mission"`
		Values []struct {
			Value             string   `yaml:"value"`
			Definition        string   `yaml:"definition"`
			BehaviorsWeExpect []string `yaml:"behaviors_we_expect"`
			ExampleDecision   string   `yaml:"example_decision"`
		} `yaml:"values"`
		CoreBeliefs struct {
			AboutOurMarket     []rawBelief `yaml:"about_our_market"`
			AboutOurUsers      []rawBelief `yaml:"about_our_users"`
			AboutOurApproach   []rawBelief `yaml:"about_our_approach"`
			AboutValueCreation []rawBelief `yaml:"about_value_creation"`
			AboutCompetition   []rawBelief `yaml:"about_competition"`
		} `yaml:"core_beliefs"`
	} `yaml:"north_star"`
}

type rawBelief struct {
	Belief      string `yaml:"belief"`
	Implication string `yaml:"implication"`
	Evidence    string `yaml:"evidence"`
}

func (d *Decomposer) decomposeNorthStar(result *Result) {
	var raw rawNorthStar
	if err := d.readYAML("READY/00_north_star.yaml", &raw); err != nil {
		return // file doesn't exist — not an error
	}

	artKey := d.addArtifactNode(result,
		"READY/00_north_star.yaml", "north_star", "READY",
		"North Star — vision, mission, purpose, core beliefs", "1")

	ns := raw.NorthStar

	// Purpose
	if ns.Purpose.Statement != "" {
		key := objectKey("Belief", "north_star:purpose")
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Belief", Key: key,
			Properties: map[string]any{
				"name": "Purpose", "statement": ns.Purpose.Statement,
				"implication": ns.Purpose.ImpactWeSeek, "evidence": ns.Purpose.ProblemWeSolve,
				"category": "about_value_creation", "inertia_tier": "1",
				"source_artifact": "READY/00_north_star.yaml", "section_path": "north_star.purpose",
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Belief")
	}

	// Vision
	if ns.Vision.Statement != "" {
		key := objectKey("Belief", "north_star:vision")
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Belief", Key: key,
			Properties: map[string]any{
				"name": "Vision", "statement": ns.Vision.Statement,
				"implication": strings.Join(ns.Vision.SuccessLooksLike, "; "), "evidence": "",
				"category": "about_our_market", "inertia_tier": "1",
				"source_artifact": "READY/00_north_star.yaml", "section_path": "north_star.vision",
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Belief")
	}

	// Mission
	if ns.Mission.Statement != "" {
		key := objectKey("Belief", "north_star:mission")
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Belief", Key: key,
			Properties: map[string]any{
				"name": "Mission", "statement": ns.Mission.Statement,
				"implication": strings.Join(ns.Mission.WhatWeDo, "; "),
				"evidence":    ns.Mission.HowDeliver.Approach,
				"category":    "about_our_approach", "inertia_tier": "1",
				"source_artifact": "READY/00_north_star.yaml", "section_path": "north_star.mission",
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Belief")
	}

	// Values
	for i, v := range ns.Values {
		key := objectKey("Belief", fmt.Sprintf("north_star:values[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Belief", Key: key,
			Properties: map[string]any{
				"name": fmt.Sprintf("Value: %s", v.Value), "statement": v.Definition,
				"implication": v.ExampleDecision,
				"evidence":    strings.Join(v.BehaviorsWeExpect, "; "),
				"category":    "about_our_approach", "inertia_tier": "1",
				"source_artifact": "READY/00_north_star.yaml",
				"section_path":    fmt.Sprintf("north_star.values[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Belief")
	}

	// Core beliefs by category
	categories := map[string][]rawBelief{
		"about_our_market":     ns.CoreBeliefs.AboutOurMarket,
		"about_our_users":      ns.CoreBeliefs.AboutOurUsers,
		"about_our_approach":   ns.CoreBeliefs.AboutOurApproach,
		"about_value_creation": ns.CoreBeliefs.AboutValueCreation,
		"about_competition":    ns.CoreBeliefs.AboutCompetition,
	}
	for category, beliefs := range categories {
		for i, b := range beliefs {
			if b.Belief == "" {
				continue
			}
			key := objectKey("Belief", fmt.Sprintf("north_star:core_beliefs.%s[%d]", category, i))
			d.addObject(result, memory.UpsertObjectRequest{
				Type: "Belief", Key: key,
				Properties: map[string]any{
					"name": truncate(b.Belief, 60), "statement": b.Belief,
					"implication": b.Implication, "evidence": b.Evidence,
					"category": category, "inertia_tier": "1",
					"source_artifact": "READY/00_north_star.yaml",
					"section_path":    fmt.Sprintf("north_star.core_beliefs.%s[%d]", category, i),
				},
			})
			d.addContains(result, artKey, "Artifact", key, "Belief")
		}
	}
}

// ============================================================
// READY/01_insight_analyses.yaml
// ============================================================

type rawInsightAnalyses struct {
	Trends struct {
		Technology   []rawTrend `yaml:"technology"`
		Market       []rawTrend `yaml:"market"`
		UserBehavior []rawTrend `yaml:"user_behavior"`
		Regulatory   []rawTrend `yaml:"regulatory"`
		Competitive  []rawTrend `yaml:"competitive"`
	} `yaml:"trends"`
	TargetUsers []rawTargetUser `yaml:"target_users"`
}

type rawTrend struct {
	Trend     string   `yaml:"trend"`
	Timeframe string   `yaml:"timeframe"`
	Impact    string   `yaml:"impact"`
	Evidence  []string `yaml:"evidence"`
}

type rawTargetUser struct {
	Persona      string `yaml:"persona"`
	Description  string `yaml:"description"`
	CurrentState struct {
		Goals []string `yaml:"goals"`
	} `yaml:"current_state"`
	Problems []rawProblem `yaml:"problems"`
}

type rawProblem struct {
	Problem  string `yaml:"problem"`
	Severity string `yaml:"severity"`
}

func (d *Decomposer) decomposeInsightAnalyses(result *Result) {
	var raw rawInsightAnalyses
	if err := d.readYAML("READY/01_insight_analyses.yaml", &raw); err != nil {
		return
	}

	artKey := d.addArtifactNode(result,
		"READY/01_insight_analyses.yaml", "insight_analyses", "READY",
		"Insight analyses — trends, market structure, personas, pain points", "2")

	// Trends
	trendGroups := map[string][]rawTrend{
		"technology":    raw.Trends.Technology,
		"market":        raw.Trends.Market,
		"user_behavior": raw.Trends.UserBehavior,
		"regulatory":    raw.Trends.Regulatory,
		"competitive":   raw.Trends.Competitive,
	}
	for trendType, trends := range trendGroups {
		for i, t := range trends {
			key := objectKey("Trend", fmt.Sprintf("insight_analyses:trends.%s[%d]", trendType, i))
			d.addObject(result, memory.UpsertObjectRequest{
				Type: "Trend", Key: key,
				Properties: map[string]any{
					"name": t.Trend, "description": t.Impact,
					"trend_type": trendType, "timeframe": normalizeTimeframe(t.Timeframe),
					"impact": t.Impact, "inertia_tier": "2",
					"source_artifact": "READY/01_insight_analyses.yaml",
					"section_path":    fmt.Sprintf("trends.%s[%d]", trendType, i),
				},
			})
			d.addContains(result, artKey, "Artifact", key, "Trend")
		}
	}

	// Personas and pain points
	for _, tu := range raw.TargetUsers {
		personaID := sanitizeKey(tu.Persona)
		personaKey := objectKey("Persona", fmt.Sprintf("persona:%s", personaID))
		goalsStr := strings.Join(tu.CurrentState.Goals, "; ")

		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Persona", Key: personaKey,
			Properties: map[string]any{
				"name": tu.Persona, "description": tu.Description,
				"persona_id": personaID, "role": tu.Persona,
				"goals": goalsStr, "inertia_tier": "2",
				"source_artifact": "READY/01_insight_analyses.yaml",
			},
		})
		d.addContains(result, artKey, "Artifact", personaKey, "Persona")

		for j, prob := range tu.Problems {
			ppKey := objectKey("PainPoint", fmt.Sprintf("insight_analyses:persona:%s:problem[%d]", personaID, j))
			d.addObject(result, memory.UpsertObjectRequest{
				Type: "PainPoint", Key: ppKey,
				Properties: map[string]any{
					"name": truncate(prob.Problem, 60), "description": prob.Problem,
					"severity": prob.Severity, "persona_ref": personaID,
					"inertia_tier": "2", "source_artifact": "READY/01_insight_analyses.yaml",
					"section_path": fmt.Sprintf("target_users[%s].problems[%d]", personaID, j),
				},
			})
			d.addContains(result, artKey, "Artifact", ppKey, "PainPoint")
			d.addRel(result, "elaborates", personaKey, "Persona", ppKey, "PainPoint",
				map[string]any{"confidence": "1.0", "weight": "0.8", "edge_source": "structural"})
		}
	}
}

// ============================================================
// READY/04_strategy_formula.yaml
// ============================================================

type rawStrategyFormula struct {
	Strategy struct {
		Positioning struct {
			PositioningStatement string `yaml:"positioning_statement"`
			CategoryPosition     string `yaml:"category_position"`
		} `yaml:"positioning"`
		CompetitiveMoat struct {
			Advantages []struct {
				Name          string `yaml:"name"`
				Description   string `yaml:"description"`
				Defensibility string `yaml:"defensibility"`
			} `yaml:"advantages"`
			VsCompetitors []struct {
				Competitor    string `yaml:"competitor"`
				TheirStrength string `yaml:"their_strength"`
				OurAngle      string `yaml:"our_angle"`
				Wedge         string `yaml:"wedge"`
			} `yaml:"vs_competitors"`
		} `yaml:"competitive_moat"`
	} `yaml:"strategy"`
}

func (d *Decomposer) decomposeStrategyFormula(result *Result) {
	var raw rawStrategyFormula
	if err := d.readYAML("READY/04_strategy_formula.yaml", &raw); err != nil {
		return
	}

	artKey := d.addArtifactNode(result,
		"READY/04_strategy_formula.yaml", "strategy_formula", "READY",
		"Strategy formula — positioning, competitive moat, business model", "3")

	sf := raw.Strategy

	// Positioning
	if sf.Positioning.PositioningStatement != "" {
		key := objectKey("Positioning", "strategy_formula:positioning")
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Positioning", Key: key,
			Properties: map[string]any{
				"name": "Market Positioning", "claim": sf.Positioning.PositioningStatement,
				"vs_competitor": "", "moat_type": "methodology",
				"inertia_tier": "3", "source_artifact": "READY/04_strategy_formula.yaml",
				"section_path": "strategy.positioning",
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Positioning")
	}

	// Advantages
	for i, adv := range sf.CompetitiveMoat.Advantages {
		key := objectKey("Positioning", fmt.Sprintf("strategy_formula:advantages[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Positioning", Key: key,
			Properties: map[string]any{
				"name": adv.Name, "claim": adv.Description,
				"vs_competitor": "", "moat_type": classifyMoatType(adv.Defensibility),
				"inertia_tier": "3", "source_artifact": "READY/04_strategy_formula.yaml",
				"section_path": fmt.Sprintf("strategy.competitive_moat.advantages[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Positioning")
	}

	// Competitor comparisons
	for i, vc := range sf.CompetitiveMoat.VsCompetitors {
		key := objectKey("Positioning", fmt.Sprintf("strategy_formula:vs_competitors[%d]", i))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Positioning", Key: key,
			Properties: map[string]any{
				"name": fmt.Sprintf("vs %s", vc.Competitor), "claim": vc.OurAngle,
				"vs_competitor": vc.Competitor, "moat_type": classifyMoatType(vc.Wedge),
				"inertia_tier": "3", "source_artifact": "READY/04_strategy_formula.yaml",
				"section_path": fmt.Sprintf("strategy.competitive_moat.vs_competitors[%d]", i),
			},
		})
		d.addContains(result, artKey, "Artifact", key, "Positioning")
	}
}

// ============================================================
// READY/05_roadmap_recipe.yaml
// ============================================================

type rawRoadmap struct {
	Roadmap struct {
		ID     string `yaml:"id"`
		Cycle  int    `yaml:"cycle"`
		Tracks map[string]struct {
			TrackObjective string `yaml:"track_objective"`
			OKRs           []struct {
				ID         string `yaml:"id"`
				Objective  string `yaml:"objective"`
				KeyResults []struct {
					ID                string `yaml:"id"`
					Description       string `yaml:"description"`
					Target            string `yaml:"target"`
					Status            string `yaml:"status"`
					MeasurementMethod string `yaml:"measurement_method"`
					ValueModelTarget  struct {
						ComponentPath string `yaml:"component_path"`
					} `yaml:"value_model_target"`
				} `yaml:"key_results"`
			} `yaml:"okrs"`
			RiskiestAssumptions []struct {
				ID               string   `yaml:"id"`
				Description      string   `yaml:"description"`
				Type             string   `yaml:"type"`
				Criticality      string   `yaml:"criticality"`
				Confidence       string   `yaml:"confidence"`
				EvidenceRequired string   `yaml:"evidence_required"`
				LinkedToKR       []string `yaml:"linked_to_kr"`
			} `yaml:"riskiest_assumptions"`
		} `yaml:"tracks"`
	} `yaml:"roadmap"`
}

func (d *Decomposer) decomposeRoadmap(result *Result) {
	var raw rawRoadmap
	if err := d.readYAML("READY/05_roadmap_recipe.yaml", &raw); err != nil {
		return
	}

	artKey := d.addArtifactNode(result,
		"READY/05_roadmap_recipe.yaml", "roadmap_recipe", "READY",
		"Roadmap — OKRs, key results, assumptions", "4")

	rm := raw.Roadmap
	cycle := fmt.Sprintf("C%d", rm.Cycle)

	for trackName, track := range rm.Tracks {
		// OKRs and Key Results
		for _, okr := range track.OKRs {
			okrKey := objectKey("OKR", fmt.Sprintf("roadmap:%s", okr.ID))
			d.addObject(result, memory.UpsertObjectRequest{
				Type: "OKR", Key: okrKey,
				Properties: map[string]any{
					"name": okr.Objective, "description": okr.Objective,
					"okr_id": okr.ID, "track": trackName,
					"cycle": cycle, "status": "", "target_value": "",
					"inertia_tier": "4", "source_artifact": "READY/05_roadmap_recipe.yaml",
				},
			})
			d.addContains(result, artKey, "Artifact", okrKey, "OKR")

			for _, kr := range okr.KeyResults {
				krKey := objectKey("OKR", fmt.Sprintf("roadmap:%s", kr.ID))
				d.addObject(result, memory.UpsertObjectRequest{
					Type: "OKR", Key: krKey,
					Properties: map[string]any{
						"name": kr.Description, "description": kr.Description,
						"okr_id": kr.ID, "track": trackName,
						"cycle": cycle, "status": kr.Status, "target_value": kr.Target,
						"inertia_tier": "4", "source_artifact": "READY/05_roadmap_recipe.yaml",
					},
				})
				d.addContains(result, okrKey, "OKR", krKey, "OKR")

				// KR → ValueModelComponent
				vmPath := kr.ValueModelTarget.ComponentPath
				if vmPath != "" {
					vmKey := objectKey("ValueModelComponent", fmt.Sprintf("value_model:%s", vmPath))
					d.addRel(result, "targets", krKey, "OKR", vmKey, "ValueModelComponent",
						map[string]any{"weight": "1.0", "edge_source": "structural"})
				}
			}
		}

		// Riskiest assumptions
		for _, asm := range track.RiskiestAssumptions {
			if asm.ID == "" {
				continue
			}
			asmKey := objectKey("Assumption", fmt.Sprintf("roadmap:%s", asm.ID))
			d.addObject(result, memory.UpsertObjectRequest{
				Type: "Assumption", Key: asmKey,
				Properties: map[string]any{
					"name": truncate(asm.Description, 60), "assumption_id": asm.ID,
					"hypothesis": asm.Description, "category": asm.Type,
					"criticality": asm.Criticality, "status": "pending",
					"inertia_tier": "4", "source_artifact": "READY/05_roadmap_recipe.yaml",
					"section_path": fmt.Sprintf("roadmap.tracks.%s.riskiest_assumptions[%s]", trackName, asm.ID),
				},
			})
			d.addContains(result, artKey, "Artifact", asmKey, "Assumption")

			// Assumption → KR edges
			for _, krID := range asm.LinkedToKR {
				krKey := objectKey("OKR", fmt.Sprintf("roadmap:%s", krID))
				d.addRel(result, "tests_assumption", krKey, "OKR", asmKey, "Assumption",
					map[string]any{"weight": "1.0", "edge_source": "structural"})
			}
		}
	}

	// Cross-track dependencies and technical constraints
	d.decomposeRoadmapExtras(artKey, result)
}

// ============================================================
// FIRE/definitions/product/fd-*.yaml
// ============================================================

type rawFeature struct {
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
		JobToBeDone      string `yaml:"job_to_be_done"`
		SolutionApproach string `yaml:"solution_approach"`
		Personas         []struct {
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
		} `yaml:"personas"`
		Capabilities []struct {
			ID          string `yaml:"id"`
			Name        string `yaml:"name"`
			Description string `yaml:"description"`
			Maturity    string `yaml:"maturity"`
		} `yaml:"capabilities"`
		Scenarios []struct {
			ID       string   `yaml:"id"`
			Name     string   `yaml:"name"`
			Actor    string   `yaml:"actor"`
			Context  string   `yaml:"context"`
			Trigger  string   `yaml:"trigger"`
			Action   string   `yaml:"action"`
			Outcome  string   `yaml:"outcome"`
			Criteria []string `yaml:"acceptance_criteria"`
		} `yaml:"scenarios"`
	} `yaml:"definition"`

	Dependencies struct {
		Requires []struct {
			ID     string `yaml:"id"`
			Name   string `yaml:"name"`
			Reason string `yaml:"reason"`
		} `yaml:"requires"`
		Enables []struct {
			ID     string `yaml:"id"`
			Name   string `yaml:"name"`
			Reason string `yaml:"reason"`
		} `yaml:"enables"`
	} `yaml:"dependencies"`

	FeatureMaturity struct {
		OverallStage string `yaml:"overall_stage"`
		// Array format (legacy): capability_maturity: [{capability_id, stage, evidence}]
		CapabilityMaturity []struct {
			CapabilityID  string `yaml:"capability_id"`
			Stage         string `yaml:"stage"`
			DeliveredByKR string `yaml:"delivered_by_kr"`
			Evidence      string `yaml:"evidence"`
		} `yaml:"capability_maturity"`
		// Map format (current): capabilities: {cap-001: {maturity, evidence}}
		Capabilities map[string]struct {
			Maturity      string `yaml:"maturity"`
			Evidence      string `yaml:"evidence"`
			DeliveredByKR string `yaml:"delivered_by_kr"`
		} `yaml:"capabilities"`
	} `yaml:"feature_maturity"`
}

func (d *Decomposer) decomposeFeatures(result *Result) {
	featureDir := filepath.Join(d.instancePath, "FIRE", "definitions", "product")
	entries, err := os.ReadDir(featureDir)
	if err != nil {
		return
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") {
			continue
		}
		fpath := filepath.Join(featureDir, entry.Name())
		d.decomposeFeatureFile(fpath, entry.Name(), result)
	}
}

func (d *Decomposer) decomposeFeatureFile(absPath, fileName string, result *Result) {
	data, err := os.ReadFile(absPath)
	if err != nil {
		return
	}

	var raw rawFeature
	if err := yaml.Unmarshal(data, &raw); err != nil || raw.ID == "" {
		return
	}

	relPath := fmt.Sprintf("FIRE/definitions/product/%s", fileName)
	artKey := d.addArtifactNode(result, relPath, "feature_definition", "FIRE", raw.Name, "6")

	// Feature node
	featureKey := objectKey("Feature", fmt.Sprintf("feature:%s", raw.ID))
	d.addObject(result, memory.UpsertObjectRequest{
		Type: "Feature", Key: featureKey,
		Properties: map[string]any{
			"name": raw.Name, "description": raw.Definition.JobToBeDone,
			"feature_id": raw.ID, "status": raw.Status,
			"jtbd": raw.Definition.JobToBeDone, "inertia_tier": "6",
			"source_artifact": relPath,
		},
	})
	d.addContains(result, artKey, "Artifact", featureKey, "Feature")

	// contributes_to → ValueModelComponent
	for _, path := range raw.StrategicContext.ContributesTo {
		vmKey := objectKey("ValueModelComponent", fmt.Sprintf("value_model:%s", path))
		d.addRel(result, "contributes_to", featureKey, "Feature", vmKey, "ValueModelComponent",
			map[string]any{"weight": "1.0", "edge_source": "structural"})
	}

	// tests_assumption → Assumption
	for _, asmID := range raw.StrategicContext.AssumptionsTested {
		asmKey := objectKey("Assumption", fmt.Sprintf("roadmap:%s", asmID))
		d.addRel(result, "tests_assumption", featureKey, "Feature", asmKey, "Assumption",
			map[string]any{"weight": "1.0", "edge_source": "structural"})
	}

	// depends_on (requires)
	for _, dep := range raw.Dependencies.Requires {
		if dep.ID == "" {
			continue
		}
		depKey := objectKey("Feature", fmt.Sprintf("feature:%s", dep.ID))
		d.addRel(result, "depends_on", featureKey, "Feature", depKey, "Feature",
			map[string]any{"weight": "1.0", "edge_source": "structural"})
	}

	// depends_on (enables — reverse direction)
	for _, dep := range raw.Dependencies.Enables {
		if dep.ID == "" {
			continue
		}
		depKey := objectKey("Feature", fmt.Sprintf("feature:%s", dep.ID))
		d.addRel(result, "depends_on", depKey, "Feature", featureKey, "Feature",
			map[string]any{"weight": "1.0", "edge_source": "structural"})
	}

	// Build maturity lookup for capabilities (supports both array and map formats)
	maturityMap := map[string]struct{ stage, evidence string }{}
	// Array format (legacy): capability_maturity: [{capability_id, stage}]
	for _, cm := range raw.FeatureMaturity.CapabilityMaturity {
		maturityMap[cm.CapabilityID] = struct{ stage, evidence string }{cm.Stage, cm.Evidence}
	}
	// Map format (current): capabilities: {cap-001: {maturity, evidence}}
	for capID, cm := range raw.FeatureMaturity.Capabilities {
		maturityMap[capID] = struct{ stage, evidence string }{cm.Maturity, cm.Evidence}
	}

	// Capabilities
	for _, cap := range raw.Definition.Capabilities {
		if cap.ID == "" {
			continue
		}
		maturity := cap.Maturity
		evidence := ""
		if m, ok := maturityMap[cap.ID]; ok {
			maturity = m.stage
			evidence = m.evidence
		}
		if maturity == "" {
			maturity = "hypothetical"
		}
		capKey := objectKey("Capability", fmt.Sprintf("feature:%s:%s", raw.ID, cap.ID))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Capability", Key: capKey,
			Properties: map[string]any{
				"name": cap.Name, "description": cap.Description,
				"capability_id": cap.ID, "maturity": maturity, "evidence": evidence,
				"feature_ref": raw.ID, "inertia_tier": "7",
				"source_artifact": relPath,
				"section_path":    fmt.Sprintf("definition.capabilities[%s]", cap.ID),
			},
		})
		d.addContains(result, featureKey, "Feature", capKey, "Capability")
	}

	// Scenarios from definition.scenarios
	for _, scn := range raw.Definition.Scenarios {
		scnKey := objectKey("Scenario", fmt.Sprintf("feature:%s:scenario:%s", raw.ID, scn.ID))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Scenario", Key: scnKey,
			Properties: map[string]any{
				"name": scn.Name, "description": scn.Context,
				"persona_ref": scn.Actor, "feature_ref": raw.ID,
				"inertia_tier": "6", "source_artifact": relPath,
				"section_path": fmt.Sprintf("definition.scenarios[%s]", scn.ID),
			},
		})
		d.addContains(result, featureKey, "Feature", scnKey, "Scenario")
	}

	// Persona scenarios (from definition.personas narrative fields)
	for _, persona := range raw.Definition.Personas {
		if persona.ID == "" || persona.CurrentSituation == "" {
			continue
		}
		scnKey := objectKey("Scenario", fmt.Sprintf("feature:%s:persona:%s", raw.ID, persona.ID))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "Scenario", Key: scnKey,
			Properties: map[string]any{
				"name":        fmt.Sprintf("%s using %s", persona.Name, raw.Name),
				"description": persona.CurrentSituation,
				"persona_ref": persona.ID, "feature_ref": raw.ID,
				"inertia_tier": "6", "source_artifact": relPath,
				"section_path": fmt.Sprintf("definition.personas[%s]", persona.ID),
			},
		})
		d.addContains(result, featureKey, "Feature", scnKey, "Scenario")

		// serves → Persona
		personaKey := objectKey("Persona", fmt.Sprintf("persona:%s", persona.ID))
		d.addRel(result, "serves", featureKey, "Feature", personaKey, "Persona",
			map[string]any{"weight": "0.8", "edge_source": "structural"})
	}
}

// ============================================================
// FIRE/value_models/*.yaml
// ============================================================

type rawValueModel struct {
	TrackName   string `yaml:"track_name"`
	Description string `yaml:"description"`
	Layers      []struct {
		ID          string `yaml:"id"`
		Name        string `yaml:"name"`
		PathSegment string `yaml:"path_segment"`
		Description string `yaml:"description"`
		Components  []struct {
			ID          string `yaml:"id"`
			Name        string `yaml:"name"`
			PathSegment string `yaml:"path_segment"`
			Description string `yaml:"description"`
			UVP         string `yaml:"uvp"`
			Active      bool   `yaml:"active"`
			Maturity    struct {
				Stage string `yaml:"stage"`
			} `yaml:"maturity"`
			// Both sub_components and subs are used in practice
			SubComponents []rawSubComponent `yaml:"sub_components"`
			Subs          []rawSubComponent `yaml:"subs"`
		} `yaml:"components"`
	} `yaml:"layers"`
}

type rawSubComponent struct {
	ID          string `yaml:"id"`
	Name        string `yaml:"name"`
	Description string `yaml:"description"`
	UVP         string `yaml:"uvp"`
	Active      bool   `yaml:"active"`
	Maturity    struct {
		Stage string `yaml:"stage"`
	} `yaml:"maturity"`
}

func (d *Decomposer) decomposeValueModels(result *Result) {
	vmDir := filepath.Join(d.instancePath, "FIRE", "value_models")
	entries, err := os.ReadDir(vmDir)
	if err != nil {
		return
	}

	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".yaml") {
			continue
		}
		fpath := filepath.Join(vmDir, entry.Name())
		d.decomposeValueModelFile(fpath, entry.Name(), result)
	}
}

func (d *Decomposer) decomposeValueModelFile(absPath, fileName string, result *Result) {
	data, err := os.ReadFile(absPath)
	if err != nil {
		return
	}

	var raw rawValueModel
	if err := yaml.Unmarshal(data, &raw); err != nil || len(raw.Layers) == 0 {
		return
	}

	track := normalizeTrackName(raw.TrackName)
	relPath := fmt.Sprintf("FIRE/value_models/%s", fileName)
	artKey := d.addArtifactNode(result, relPath, "value_model", "FIRE", raw.Description, "5")

	for _, layer := range raw.Layers {
		pathSeg := layer.PathSegment
		if pathSeg == "" {
			pathSeg = layer.Name
		}
		layerPath := fmt.Sprintf("%s.%s", track, pathSeg)
		layerKey := objectKey("ValueModelComponent", fmt.Sprintf("value_model:%s", layerPath))
		d.addObject(result, memory.UpsertObjectRequest{
			Type: "ValueModelComponent", Key: layerKey,
			Properties: map[string]any{
				"name": layer.Name, "description": layer.Description,
				"value_path": layerPath, "track": track, "level": "L1",
				"maturity": "", "inertia_tier": "5", "source_artifact": relPath,
			},
		})
		d.addContains(result, artKey, "Artifact", layerKey, "ValueModelComponent")

		for _, comp := range layer.Components {
			compPathSeg := comp.PathSegment
			if compPathSeg == "" {
				compPathSeg = comp.Name
			}
			compPath := fmt.Sprintf("%s.%s", layerPath, compPathSeg)
			compKey := objectKey("ValueModelComponent", fmt.Sprintf("value_model:%s", compPath))
			desc := comp.Description
			if desc == "" {
				desc = comp.UVP
			}
			d.addObject(result, memory.UpsertObjectRequest{
				Type: "ValueModelComponent", Key: compKey,
				Properties: map[string]any{
					"name": comp.Name, "description": desc,
					"value_path": compPath, "track": track, "level": "L2",
					"maturity": comp.Maturity.Stage, "inertia_tier": "5",
					"source_artifact": relPath,
				},
			})
			d.addContains(result, layerKey, "ValueModelComponent", compKey, "ValueModelComponent")

			// Merge sub_components and subs (both keys are used in practice)
			subs := comp.SubComponents
			subs = append(subs, comp.Subs...)

			for _, sub := range subs {
				subPath := fmt.Sprintf("%s.%s", compPath, sub.Name)
				subKey := objectKey("ValueModelComponent", fmt.Sprintf("value_model:%s", subPath))
				subDesc := sub.Description
				if subDesc == "" {
					subDesc = sub.UVP
				}
				d.addObject(result, memory.UpsertObjectRequest{
					Type: "ValueModelComponent", Key: subKey,
					Properties: map[string]any{
						"name": sub.Name, "description": subDesc,
						"value_path": subPath, "track": track, "level": "L3",
						"maturity": sub.Maturity.Stage, "inertia_tier": "5",
						"source_artifact": relPath,
					},
				})
				d.addContains(result, compKey, "ValueModelComponent", subKey, "ValueModelComponent")
			}
		}
	}
}

// ============================================================
// Utility functions
// ============================================================

func sanitizeKey(s string) string {
	s = strings.ToLower(s)
	s = strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-' || r == '_' {
			return r
		}
		if r == ' ' {
			return '-'
		}
		return -1
	}, s)
	if len(s) > 80 {
		s = s[:80]
	}
	return s
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func normalizeTimeframe(tf string) string {
	tf = strings.ToLower(tf)
	switch {
	case strings.Contains(tf, "near"):
		return "near_term"
	case strings.Contains(tf, "medium"):
		return "medium_term"
	case strings.Contains(tf, "long"):
		return "long_term"
	default:
		return tf
	}
}

func normalizeTrackName(name string) string {
	switch strings.ToLower(name) {
	case "product":
		return "Product"
	case "strategy":
		return "Strategy"
	case "org_ops", "orgops":
		return "OrgOps"
	case "commercial":
		return "Commercial"
	default:
		return name
	}
}

func classifyMoatType(desc string) string {
	desc = strings.ToLower(desc)
	switch {
	case strings.Contains(desc, "technolog") || strings.Contains(desc, "algorithm") || strings.Contains(desc, "engineering"):
		return "technology"
	case strings.Contains(desc, "network") || strings.Contains(desc, "ecosystem"):
		return "network"
	case strings.Contains(desc, "data") || strings.Contains(desc, "graph"):
		return "data"
	case strings.Contains(desc, "brand") || strings.Contains(desc, "trust"):
		return "brand"
	default:
		return "methodology"
	}
}

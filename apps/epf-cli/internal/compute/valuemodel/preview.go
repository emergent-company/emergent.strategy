// Package valuemodel implements the value-model-preview inline skill handler.
package valuemodel

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"strings"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/compute"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/valuemodel"
)

//go:embed template.html
var templateFS embed.FS

// PreviewHandler renders value model data as self-contained HTML.
type PreviewHandler struct {
	tmpl *template.Template
}

// NewPreviewHandler creates and compiles the template.
func NewPreviewHandler() (*PreviewHandler, error) {
	funcMap := template.FuncMap{
		"add": func(a, b int) int { return a + b },
		"statusClass": func(active bool) string {
			if active {
				return "active"
			}
			return "planned"
		},
		"statusText": func(active bool) string {
			if active {
				return "active"
			}
			return "planned"
		},
	}

	tmplData, err := templateFS.ReadFile("template.html")
	if err != nil {
		return nil, fmt.Errorf("failed to read embedded template: %w", err)
	}

	tmpl, err := template.New("value-model-preview").Funcs(funcMap).Parse(string(tmplData))
	if err != nil {
		return nil, fmt.Errorf("failed to parse template: %w", err)
	}

	return &PreviewHandler{tmpl: tmpl}, nil
}

// Name returns the handler name matching inline.handler in skill.yaml.
func (h *PreviewHandler) Name() string {
	return "value-model-preview"
}

// TemplateData is the top-level data structure passed to the Go template.
type TemplateData struct {
	Theme                string
	Title                string
	GeneratedAt          string
	GeneratedDate        string
	TrackName            string
	Subtitle             string
	Status               string
	StatusClass          string
	Version              string
	Maturity             string
	MaturityClass        string
	Description          string
	FooterText           string
	AdditionalDataBefore []AdditionalSection
	AdditionalDataAfter  []AdditionalSection
	Layers               []LayerData
}

// AdditionalSection represents a custom content section.
type AdditionalSection struct {
	Title   string
	Content string
}

// LayerData represents an L1 layer for rendering.
type LayerData struct {
	ID            string
	Number        int
	Name          string
	Description   string
	Components    []ComponentData
	SolutionSteps []SolutionStepData
}

// ComponentData represents an L2 component for rendering.
type ComponentData struct {
	Name          string
	IsPremium     bool
	Status        string
	Description   string
	SubComponents []SubComponentData
}

// SubComponentData represents an L3 sub-component for rendering.
type SubComponentData struct {
	Status           string
	Name             string
	ValueProposition string
}

// SolutionStepData represents a solution step for rendering.
type SolutionStepData struct {
	Number  int
	Step    string
	Outcome string
}

// Execute loads value models and renders the HTML preview.
func (h *PreviewHandler) Execute(ctx context.Context, input *compute.ExecutionInput) (*compute.ExecutionResult, error) {
	log := compute.NewLogBuilder("value-model-preview")

	// Parse parameters
	theme := getStringParam(input.Parameters, "theme", "auto")
	title := getStringParam(input.Parameters, "title", "")
	subtitle := getStringParam(input.Parameters, "subtitle", "")
	footerText := getStringParam(input.Parameters, "footer_text", "")
	trackFilter := getStringParam(input.Parameters, "track", "")

	// Load value models
	log.StartStep("load_value_models")
	loader := valuemodel.NewLoader(input.InstancePath)
	modelSet, err := loader.Load()
	if err != nil {
		log.FailStep(fmt.Sprintf("failed to load value models: %v", err))
		return &compute.ExecutionResult{
			Success: false,
			Error:   fmt.Sprintf("Failed to load value models from %s: %v", input.InstancePath, err),
			Log:     log.Build(),
		}, nil
	}

	// Select which track to render
	var model *valuemodel.ValueModel
	if trackFilter != "" {
		track := valuemodel.Track(trackFilter)
		m, ok := modelSet.GetTrack(track)
		if !ok {
			tracks := modelSet.GetAllTracks()
			trackNames := make([]string, len(tracks))
			for i, t := range tracks {
				trackNames[i] = string(t)
			}
			log.FailStep(fmt.Sprintf("track %q not found", trackFilter))
			return &compute.ExecutionResult{
				Success: false,
				Error:   fmt.Sprintf("Track %q not found. Available tracks: %s", trackFilter, strings.Join(trackNames, ", ")),
				Log:     log.Build(),
			}, nil
		}
		model = m
	} else {
		// Default to first available track (prefer Product)
		tracks := modelSet.GetAllTracks()
		if len(tracks) == 0 {
			log.FailStep("no value models found")
			return &compute.ExecutionResult{
				Success: false,
				Error:   "No value models found in instance",
				Log:     log.Build(),
			}, nil
		}
		// Prefer Product track
		for _, t := range tracks {
			if strings.EqualFold(string(t), "product") {
				m, _ := modelSet.GetTrack(t)
				model = m
				break
			}
		}
		if model == nil {
			m, _ := modelSet.GetTrack(tracks[0])
			model = m
		}
	}
	log.CompleteStep(fmt.Sprintf("loaded track %s with %d layers", model.TrackName, len(model.Layers)))

	// Build template data
	log.StartStep("build_template_data")
	now := time.Now()
	data := h.buildTemplateData(model, theme, title, subtitle, footerText, now)
	log.CompleteStep(fmt.Sprintf("built data with %d layers", len(data.Layers)))

	// Render template
	log.StartStep("render_template")
	var buf bytes.Buffer
	if err := h.tmpl.Execute(&buf, data); err != nil {
		log.FailStep(fmt.Sprintf("template execution failed: %v", err))
		return &compute.ExecutionResult{
			Success: false,
			Error:   fmt.Sprintf("Template rendering failed: %v", err),
			Log:     log.Build(),
		}, nil
	}
	log.CompleteStep(fmt.Sprintf("rendered %d bytes", buf.Len()))

	// Build filename
	filename := fmt.Sprintf("value-model-%s.html", strings.ToLower(string(model.TrackName)))

	return &compute.ExecutionResult{
		Success: true,
		Output: &compute.ExecutionOutput{
			Format:   "html",
			Content:  buf.String(),
			Filename: filename,
		},
		Log: log.Build(),
	}, nil
}

func (h *PreviewHandler) buildTemplateData(model *valuemodel.ValueModel, theme, title, subtitle, footerText string, now time.Time) TemplateData {
	if title == "" {
		title = string(model.TrackName) + " Value Model"
	}

	status := model.Status
	if status == "" {
		status = "active"
	}
	statusClass := strings.ToLower(status)

	maturity := ""
	maturityClass := ""
	if model.TrackMaturity.OverallStage != "" {
		maturity = string(model.TrackMaturity.OverallStage)
		maturityClass = strings.ToLower(maturity)
	}

	data := TemplateData{
		Theme:         theme,
		Title:         title,
		GeneratedAt:   now.Format(time.RFC3339),
		GeneratedDate: now.Format("January 2, 2006"),
		TrackName:     string(model.TrackName),
		Subtitle:      subtitle,
		Status:        status,
		StatusClass:   statusClass,
		Version:       model.Version,
		Maturity:      maturity,
		MaturityClass: maturityClass,
		Description:   model.Description,
		FooterText:    footerText,
	}

	// Build layers
	for i, layer := range model.Layers {
		ld := LayerData{
			ID:     layer.ID,
			Number: i + 1,
			Name:   layer.Name,
		}
		if layer.Description != "" {
			ld.Description = layer.Description
		}

		// Build components
		for _, comp := range layer.Components {
			cd := ComponentData{
				Name: comp.Name,
			}
			if comp.Description != "" {
				cd.Description = comp.Description
			}
			if comp.Active {
				cd.Status = "active"
			} else {
				cd.Status = "planned"
			}

			// Build sub-components
			subs := comp.GetSubComponents()
			for _, sub := range subs {
				sd := SubComponentData{
					Name: sub.Name,
				}
				if sub.Active {
					sd.Status = "active"
				} else {
					sd.Status = "planned"
				}
				if sub.UVP != "" {
					sd.ValueProposition = sub.UVP
				}
				cd.SubComponents = append(cd.SubComponents, sd)
			}

			ld.Components = append(ld.Components, cd)
		}

		// Build solution steps
		for j, step := range layer.SolutionSteps {
			ld.SolutionSteps = append(ld.SolutionSteps, SolutionStepData{
				Number:  j + 1,
				Step:    step.Step,
				Outcome: step.Outcome,
			})
		}

		data.Layers = append(data.Layers, ld)
	}

	// Parse additional data from parameters (handled in Execute via input.Parameters)
	return data
}

func getStringParam(params map[string]interface{}, key, defaultVal string) string {
	if params == nil {
		return defaultVal
	}
	v, ok := params[key]
	if !ok {
		return defaultVal
	}
	s, ok := v.(string)
	if !ok {
		// Try JSON number/bool conversion
		b, err := json.Marshal(v)
		if err != nil {
			return defaultVal
		}
		return strings.Trim(string(b), "\"")
	}
	return s
}

func init() {
	handler, err := NewPreviewHandler()
	if err != nil {
		// Don't panic at init -- log and skip registration
		fmt.Printf("Warning: failed to initialize value-model-preview handler: %v\n", err)
		return
	}
	compute.DefaultRegistry.Register(handler)
}

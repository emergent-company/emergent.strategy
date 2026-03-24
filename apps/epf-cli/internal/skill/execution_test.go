package skill

import (
	"testing"

	"gopkg.in/yaml.v3"
)

func TestExecutionModeFromString(t *testing.T) {
	tests := []struct {
		input   string
		want    ExecutionMode
		wantErr bool
	}{
		{"", ExecutionPromptDelivery, false},
		{"prompt-delivery", ExecutionPromptDelivery, false},
		{"inline", ExecutionInline, false},
		{"script", ExecutionScript, false},
		{"plugin", ExecutionPlugin, false},
		{"INLINE", ExecutionInline, false},
		{" Script ", ExecutionScript, false},
		{"delegated", "", true},
		{"compute", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := ExecutionModeFromString(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ExecutionModeFromString(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("ExecutionModeFromString(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

func TestManifestParsingWithExecutionFields(t *testing.T) {
	t.Run("inline skill manifest", func(t *testing.T) {
		yamlContent := `
name: value-model-preview
version: "1.0.0"
type: generation
description: Renders value model as HTML
execution: inline
inline:
  handler: value-model-preview
  parameters:
    - name: instance_path
      type: string
      required: true
    - name: format
      type: string
      default: single
      enum: [single, portfolio]
`
		var m SkillManifest
		if err := yaml.Unmarshal([]byte(yamlContent), &m); err != nil {
			t.Fatalf("Failed to parse: %v", err)
		}

		if m.Execution != ExecutionInline {
			t.Errorf("Execution = %q, want %q", m.Execution, ExecutionInline)
		}
		if m.Inline == nil {
			t.Fatal("Inline spec is nil")
		}
		if m.Inline.Handler != "value-model-preview" {
			t.Errorf("Handler = %q, want %q", m.Inline.Handler, "value-model-preview")
		}
		if len(m.Inline.Parameters) != 2 {
			t.Errorf("Parameters count = %d, want 2", len(m.Inline.Parameters))
		}
		if m.Inline.Parameters[0].Name != "instance_path" {
			t.Errorf("First param = %q, want %q", m.Inline.Parameters[0].Name, "instance_path")
		}
		if !m.Inline.Parameters[0].Required {
			t.Error("First param should be required")
		}
		if m.Inline.Parameters[1].Default != "single" {
			t.Errorf("Second param default = %q, want %q", m.Inline.Parameters[1].Default, "single")
		}
		if len(m.Inline.Parameters[1].Enum) != 2 {
			t.Errorf("Second param enum count = %d, want 2", len(m.Inline.Parameters[1].Enum))
		}
	})

	t.Run("script skill manifest", func(t *testing.T) {
		yamlContent := `
name: vat-calculator
version: "1.0.0"
type: analysis
description: Calculate VAT amounts
execution: script
script:
  command: python3
  args: [scripts/calculate_vat.py]
  input: json
  output: json
  timeout: 60
`
		var m SkillManifest
		if err := yaml.Unmarshal([]byte(yamlContent), &m); err != nil {
			t.Fatalf("Failed to parse: %v", err)
		}

		if m.Execution != ExecutionScript {
			t.Errorf("Execution = %q, want %q", m.Execution, ExecutionScript)
		}
		if m.Script == nil {
			t.Fatal("Script spec is nil")
		}
		if m.Script.Command != "python3" {
			t.Errorf("Command = %q, want %q", m.Script.Command, "python3")
		}
		if len(m.Script.Args) != 1 || m.Script.Args[0] != "scripts/calculate_vat.py" {
			t.Errorf("Args = %v, want [scripts/calculate_vat.py]", m.Script.Args)
		}
		if m.Script.Timeout != 60 {
			t.Errorf("Timeout = %d, want 60", m.Script.Timeout)
		}
	})

	t.Run("prompt-delivery manifest without execution field", func(t *testing.T) {
		yamlContent := `
name: feature-definition
version: "1.0.0"
type: creation
description: Create feature definitions
`
		var m SkillManifest
		if err := yaml.Unmarshal([]byte(yamlContent), &m); err != nil {
			t.Fatalf("Failed to parse: %v", err)
		}

		// Should be empty string (defaults to prompt-delivery during validation)
		if m.Execution != "" {
			t.Errorf("Execution = %q, want empty (defaults during validation)", m.Execution)
		}
	})
}

func TestValidateExecutionMode(t *testing.T) {
	t.Run("prompt-delivery is default when empty", func(t *testing.T) {
		m := &SkillManifest{Name: "test", Execution: ""}
		warnings, errs := validateExecutionMode(m, SourceFramework)
		if len(errs) != 0 {
			t.Errorf("Unexpected errors: %v", errs)
		}
		if len(warnings) != 0 {
			t.Errorf("Unexpected warnings: %v", warnings)
		}
		if m.Execution != ExecutionPromptDelivery {
			t.Errorf("Execution = %q, want %q", m.Execution, ExecutionPromptDelivery)
		}
	})

	t.Run("inline requires handler", func(t *testing.T) {
		m := &SkillManifest{Name: "test", Execution: ExecutionInline}
		_, errs := validateExecutionMode(m, SourceFramework)
		if len(errs) != 1 {
			t.Fatalf("Expected 1 error, got %d: %v", len(errs), errs)
		}
		if errs[0].Error() != `skill "test": execution mode 'inline' requires inline.handler` {
			t.Errorf("Unexpected error: %v", errs[0])
		}
	})

	t.Run("inline with handler passes", func(t *testing.T) {
		m := &SkillManifest{
			Name:      "test",
			Execution: ExecutionInline,
			Inline:    &InlineSpec{Handler: "value-model-preview"},
		}
		_, errs := validateExecutionMode(m, SourceFramework)
		if len(errs) != 0 {
			t.Errorf("Unexpected errors: %v", errs)
		}
	})

	t.Run("script requires command", func(t *testing.T) {
		m := &SkillManifest{Name: "test", Execution: ExecutionScript}
		_, errs := validateExecutionMode(m, SourceInstance)
		if len(errs) != 1 {
			t.Fatalf("Expected 1 error, got %d: %v", len(errs), errs)
		}
	})

	t.Run("script with command from instance passes", func(t *testing.T) {
		m := &SkillManifest{
			Name:      "test",
			Execution: ExecutionScript,
			Script:    &ScriptSpec{Command: "python3"},
		}
		_, errs := validateExecutionMode(m, SourceInstance)
		if len(errs) != 0 {
			t.Errorf("Unexpected errors: %v", errs)
		}
	})

	t.Run("script from framework demoted to prompt-delivery", func(t *testing.T) {
		m := &SkillManifest{
			Name:      "test",
			Execution: ExecutionScript,
			Script:    &ScriptSpec{Command: "python3"},
		}
		warnings, errs := validateExecutionMode(m, SourceFramework)
		if len(errs) != 0 {
			t.Errorf("Unexpected errors: %v", errs)
		}
		if len(warnings) != 1 {
			t.Fatalf("Expected 1 warning, got %d: %v", len(warnings), warnings)
		}
		if m.Execution != ExecutionPromptDelivery {
			t.Errorf("Execution should be demoted to prompt-delivery, got %q", m.Execution)
		}
	})

	t.Run("plugin not yet supported", func(t *testing.T) {
		m := &SkillManifest{Name: "test", Execution: ExecutionPlugin}
		_, errs := validateExecutionMode(m, SourceInstance)
		if len(errs) != 1 {
			t.Fatalf("Expected 1 error, got %d: %v", len(errs), errs)
		}
		if errs[0].Error() != `skill "test": execution mode 'plugin' is not yet supported` {
			t.Errorf("Unexpected error: %v", errs[0])
		}
	})

	t.Run("unknown execution mode", func(t *testing.T) {
		m := &SkillManifest{Name: "test", Execution: "compute"}
		_, errs := validateExecutionMode(m, SourceInstance)
		if len(errs) != 1 {
			t.Fatalf("Expected 1 error, got %d: %v", len(errs), errs)
		}
	})

	t.Run("prompt-delivery with inline block warns", func(t *testing.T) {
		m := &SkillManifest{
			Name:      "test",
			Execution: ExecutionPromptDelivery,
			Inline:    &InlineSpec{Handler: "something"},
		}
		warnings, errs := validateExecutionMode(m, SourceFramework)
		if len(errs) != 0 {
			t.Errorf("Unexpected errors: %v", errs)
		}
		if len(warnings) != 1 {
			t.Fatalf("Expected 1 warning, got %d: %v", len(warnings), warnings)
		}
	})

	t.Run("prompt-delivery with script block warns", func(t *testing.T) {
		m := &SkillManifest{
			Name:      "test",
			Execution: ExecutionPromptDelivery,
			Script:    &ScriptSpec{Command: "python3"},
		}
		warnings, errs := validateExecutionMode(m, SourceFramework)
		if len(errs) != 0 {
			t.Errorf("Unexpected errors: %v", errs)
		}
		if len(warnings) != 1 {
			t.Fatalf("Expected 1 warning, got %d: %v", len(warnings), warnings)
		}
	})
}

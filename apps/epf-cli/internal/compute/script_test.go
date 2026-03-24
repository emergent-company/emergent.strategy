package compute

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/skill"
)

func TestScriptExecutor_Success(t *testing.T) {
	// Create a temp directory with a test script
	dir := t.TempDir()
	scriptPath := filepath.Join(dir, "success.py")
	err := os.WriteFile(scriptPath, []byte(`#!/usr/bin/env python3
import json, sys
input_data = json.load(sys.stdin)
result = {
    "success": True,
    "output": {
        "format": "json",
        "content": {"instance": input_data["instance_path"], "echo": "hello"}
    }
}
json.dump(result, sys.stdout)
`), 0755)
	if err != nil {
		t.Fatalf("Failed to write test script: %v", err)
	}

	executor := NewScriptExecutor()
	spec := &skill.ScriptSpec{
		Command: "python3",
		Args:    []string{"success.py"},
		Input:   "json",
		Output:  "json",
	}
	input := &ExecutionInput{
		InstancePath: "/test/instance",
		Parameters:   map[string]interface{}{"key": "value"},
		SkillDir:     dir,
	}

	result, err := executor.Execute(context.Background(), spec, input)
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if !result.Success {
		t.Fatalf("Expected success, got error: %s", result.Error)
	}

	if result.Output == nil {
		t.Fatal("Output is nil")
	}
	if result.Output.Format != "json" {
		t.Errorf("Format = %q, want %q", result.Output.Format, "json")
	}

	// Check execution log
	if result.Log == nil {
		t.Fatal("Execution log is nil")
	}
	if result.Log.Skill != "script" {
		t.Errorf("Log.Skill = %q, want %q", result.Log.Skill, "script")
	}
	for _, step := range result.Log.Steps {
		if step.Status != "success" {
			t.Errorf("Step %q status = %q, want success", step.Name, step.Status)
		}
	}
}

func TestScriptExecutor_ScriptError(t *testing.T) {
	dir := t.TempDir()
	scriptPath := filepath.Join(dir, "error.py")
	err := os.WriteFile(scriptPath, []byte(`#!/usr/bin/env python3
import sys
print("some debug output", file=sys.stderr)
sys.exit(1)
`), 0755)
	if err != nil {
		t.Fatalf("Failed to write test script: %v", err)
	}

	executor := NewScriptExecutor()
	spec := &skill.ScriptSpec{
		Command: "python3",
		Args:    []string{"error.py"},
	}
	input := &ExecutionInput{
		InstancePath: "/test/instance",
		SkillDir:     dir,
	}

	result, err := executor.Execute(context.Background(), spec, input)
	if err != nil {
		t.Fatalf("Execute should not return Go error for script failures: %v", err)
	}

	if result.Success {
		t.Error("Expected failure for script with non-zero exit")
	}
	if result.Error == "" {
		t.Error("Expected error message")
	}
	if !strings.Contains(result.Error, "script execution failed") {
		t.Errorf("Error should mention script failure, got: %s", result.Error)
	}
	if !strings.Contains(result.Error, "some debug output") {
		t.Errorf("Error should include stderr output, got: %s", result.Error)
	}
}

func TestScriptExecutor_InvalidJSON(t *testing.T) {
	dir := t.TempDir()
	scriptPath := filepath.Join(dir, "bad_json.py")
	err := os.WriteFile(scriptPath, []byte(`#!/usr/bin/env python3
print("not valid json {{{")
`), 0755)
	if err != nil {
		t.Fatalf("Failed to write test script: %v", err)
	}

	executor := NewScriptExecutor()
	spec := &skill.ScriptSpec{
		Command: "python3",
		Args:    []string{"bad_json.py"},
	}
	input := &ExecutionInput{
		InstancePath: "/test/instance",
		SkillDir:     dir,
	}

	result, err := executor.Execute(context.Background(), spec, input)
	if err != nil {
		t.Fatalf("Execute should not return Go error: %v", err)
	}

	if result.Success {
		t.Error("Expected failure for invalid JSON output")
	}
	if !strings.Contains(result.Error, "invalid JSON output") {
		t.Errorf("Error should mention invalid JSON, got: %s", result.Error)
	}
}

func TestScriptExecutor_Timeout(t *testing.T) {
	dir := t.TempDir()
	scriptPath := filepath.Join(dir, "slow.py")
	err := os.WriteFile(scriptPath, []byte(`#!/usr/bin/env python3
import time
time.sleep(60)
`), 0755)
	if err != nil {
		t.Fatalf("Failed to write test script: %v", err)
	}

	executor := NewScriptExecutor()
	spec := &skill.ScriptSpec{
		Command: "python3",
		Args:    []string{"slow.py"},
		Timeout: 1, // 1 second timeout
	}
	input := &ExecutionInput{
		InstancePath: "/test/instance",
		SkillDir:     dir,
	}

	start := time.Now()
	result, err := executor.Execute(context.Background(), spec, input)
	elapsed := time.Since(start)

	if err != nil {
		t.Fatalf("Execute should not return Go error: %v", err)
	}

	if result.Success {
		t.Error("Expected failure for timeout")
	}
	if !strings.Contains(result.Error, "timed out") {
		t.Errorf("Error should mention timeout, got: %s", result.Error)
	}
	// Should have been killed within ~2 seconds (1s timeout + buffer)
	if elapsed > 5*time.Second {
		t.Errorf("Took too long: %v (expected ~1s)", elapsed)
	}
}

func TestScriptExecutor_CommandNotFound(t *testing.T) {
	executor := NewScriptExecutor()
	spec := &skill.ScriptSpec{
		Command: "nonexistent-command-that-does-not-exist-12345",
		Args:    []string{"arg1"},
	}
	input := &ExecutionInput{
		InstancePath: "/test/instance",
	}

	result, err := executor.Execute(context.Background(), spec, input)
	if err != nil {
		t.Fatalf("Execute should not return Go error: %v", err)
	}

	if result.Success {
		t.Error("Expected failure for command not found")
	}
	if !strings.Contains(result.Error, "script execution failed") {
		t.Errorf("Error should mention script failure, got: %s", result.Error)
	}
}

func TestScriptExecutor_NilSpec(t *testing.T) {
	executor := NewScriptExecutor()
	input := &ExecutionInput{InstancePath: "/test"}

	_, err := executor.Execute(context.Background(), nil, input)
	if err == nil {
		t.Error("Expected Go error for nil spec")
	}
}

func TestScriptExecutor_EmptyCommand(t *testing.T) {
	executor := NewScriptExecutor()
	spec := &skill.ScriptSpec{Command: ""}
	input := &ExecutionInput{InstancePath: "/test"}

	_, err := executor.Execute(context.Background(), spec, input)
	if err == nil {
		t.Error("Expected Go error for empty command")
	}
}

func TestScriptExecutor_RelativePathResolution(t *testing.T) {
	dir := t.TempDir()
	subdir := filepath.Join(dir, "scripts")
	os.MkdirAll(subdir, 0755)

	scriptPath := filepath.Join(subdir, "test.py")
	err := os.WriteFile(scriptPath, []byte(`#!/usr/bin/env python3
import json, sys
json.dump({"success": True, "output": {"format": "json", "content": "ok"}}, sys.stdout)
`), 0755)
	if err != nil {
		t.Fatalf("Failed to write test script: %v", err)
	}

	executor := NewScriptExecutor()
	spec := &skill.ScriptSpec{
		Command: "python3",
		Args:    []string{"scripts/test.py"}, // Relative path
	}
	input := &ExecutionInput{
		InstancePath: "/test/instance",
		SkillDir:     dir, // Relative paths resolved from here
	}

	result, err := executor.Execute(context.Background(), spec, input)
	if err != nil {
		t.Fatalf("Execute returned error: %v", err)
	}

	if !result.Success {
		t.Fatalf("Expected success, got error: %s", result.Error)
	}
}

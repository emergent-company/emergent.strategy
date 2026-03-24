package compute

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/skill"
)

// ScriptExecutor runs script-based skills as subprocesses.
type ScriptExecutor struct{}

// NewScriptExecutor creates a new script executor.
func NewScriptExecutor() *ScriptExecutor {
	return &ScriptExecutor{}
}

// scriptInput is the JSON object sent to the script on stdin.
type scriptInput struct {
	InstancePath string                 `json:"instance_path"`
	Parameters   map[string]interface{} `json:"parameters,omitempty"`
	SkillDir     string                 `json:"skill_dir"`
}

// Execute runs a script skill as a subprocess.
func (e *ScriptExecutor) Execute(ctx context.Context, spec *skill.ScriptSpec, input *ExecutionInput) (*ExecutionResult, error) {
	if spec == nil {
		return nil, fmt.Errorf("script spec is nil")
	}
	if spec.Command == "" {
		return nil, fmt.Errorf("script command is empty")
	}

	log := NewLogBuilder("script")

	// Determine timeout
	timeout := 30 * time.Second
	if spec.Timeout > 0 {
		timeout = time.Duration(spec.Timeout) * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Resolve command -- if relative, resolve from skill directory
	command := spec.Command
	args := make([]string, len(spec.Args))
	copy(args, spec.Args)

	// Resolve relative paths in args
	if input.SkillDir != "" {
		for i, arg := range args {
			if !filepath.IsAbs(arg) {
				args[i] = filepath.Join(input.SkillDir, arg)
			}
		}
	}

	// Build subprocess
	log.StartStep("spawn_process")
	cmd := exec.CommandContext(ctx, command, args...)

	// Prepare stdin JSON
	stdinData := scriptInput{
		InstancePath: input.InstancePath,
		Parameters:   input.Parameters,
		SkillDir:     input.SkillDir,
	}
	stdinJSON, err := json.Marshal(stdinData)
	if err != nil {
		log.FailStep(fmt.Sprintf("failed to marshal stdin: %v", err))
		return &ExecutionResult{
			Success: false,
			Error:   fmt.Sprintf("failed to prepare script input: %v", err),
			Log:     log.Build(),
		}, nil
	}

	cmd.Stdin = bytes.NewReader(stdinJSON)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	log.CompleteStep("process configured")

	// Execute
	log.StartStep("execute")
	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			log.FailStep("timeout exceeded")
			return &ExecutionResult{
				Success: false,
				Error:   fmt.Sprintf("script timed out after %v", timeout),
				Log:     log.Build(),
			}, nil
		}
		log.FailStep(fmt.Sprintf("exit error: %v", err))
		errMsg := fmt.Sprintf("script execution failed: %v", err)
		if stderr.Len() > 0 {
			errMsg += fmt.Sprintf("\nstderr: %s", stderr.String())
		}
		return &ExecutionResult{
			Success: false,
			Error:   errMsg,
			Log:     log.Build(),
		}, nil
	}
	log.CompleteStep(fmt.Sprintf("completed, %d bytes output", stdout.Len()))

	// Parse stdout as ExecutionResult JSON
	log.StartStep("parse_output")
	var result ExecutionResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		log.FailStep(fmt.Sprintf("invalid JSON output: %v", err))
		return &ExecutionResult{
			Success: false,
			Error:   fmt.Sprintf("script produced invalid JSON output: %v\nraw output: %s", err, stdout.String()),
			Log:     log.Build(),
		}, nil
	}
	log.CompleteStep("parsed successfully")

	// Attach our execution log (script's log is nested in its result if it provides one)
	result.Log = log.Build()
	return &result, nil
}

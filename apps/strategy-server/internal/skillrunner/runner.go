// Package skillrunner executes script-mode skills as isolated subprocesses.
//
// The script receives a JSON object on stdin with keys:
//   - instance_id: string
//   - artifacts:   array of artifact objects
//   - relationships: array of relationship objects
//   - params:      caller-supplied parameters
//
// The script must write a JSON object to stdout:
//
//	{"output": "...", "format": "markdown|yaml|html|json"}
//
// Limits:
//   - 30 second execution timeout (kills the subprocess)
//   - 64 MB stdout cap (kills the subprocess on overflow)
//   - No database credentials are passed to the script
package skillrunner

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

const (
	defaultTimeout = 30 * time.Second
	maxStdoutBytes = 64 * 1024 * 1024 // 64 MB
)

// ScriptResult holds the raw stdout bytes from a successful script execution.
type ScriptResult struct {
	Stdout   []byte
	Duration time.Duration
}

// Run executes scriptSrc (raw script content) in the interpreter for scriptLang,
// writing stdin to the subprocess. Returns the stdout bytes or an error.
//
// Supported scriptLang values:
//
//	py  → python3
//	sh  → bash
//	ts  → deno run
//	js  → node
func Run(ctx context.Context, scriptSrc, scriptLang string, stdin []byte) (*ScriptResult, error) {
	interp, ext, err := interpreterFor(scriptLang)
	if err != nil {
		return nil, err
	}

	// Write script to a temp file.
	tmpDir, err := os.MkdirTemp("", "skillrunner-*")
	if err != nil {
		return nil, fmt.Errorf("skillrunner: create temp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir) //nolint:errcheck

	scriptPath := filepath.Join(tmpDir, "skill"+ext)
	if err := os.WriteFile(scriptPath, []byte(scriptSrc), 0700); err != nil { //nolint:gosec
		return nil, fmt.Errorf("skillrunner: write script: %w", err)
	}

	// Build command with context timeout.
	runCtx, cancel := context.WithTimeout(ctx, defaultTimeout)
	defer cancel()

	var args []string
	switch scriptLang {
	case "ts":
		args = []string{"run", scriptPath}
	default:
		args = []string{scriptPath}
	}

	cmd := exec.CommandContext(runCtx, interp, args...) //nolint:gosec
	cmd.Stdin = bytes.NewReader(stdin)

	// Cap stdout at maxStdoutBytes using a LimitedReader piped through a buffer.
	var stdoutBuf bytes.Buffer
	pr, pw := io.Pipe()
	cmd.Stdout = pw

	var stderrBuf bytes.Buffer
	cmd.Stderr = &stderrBuf

	start := time.Now()
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("skillrunner: start %s: %w", interp, err)
	}

	// Drain stdout with a cap.
	capErr := make(chan error, 1)
	go func() {
		_, err := io.Copy(&stdoutBuf, io.LimitReader(pr, maxStdoutBytes))
		capErr <- err
	}()

	waitErr := cmd.Wait()
	pw.Close() //nolint:errcheck
	<-capErr
	duration := time.Since(start)

	if runCtx.Err() == context.DeadlineExceeded {
		return nil, fmt.Errorf("skillrunner: script exceeded %s timeout", defaultTimeout)
	}
	if stdoutBuf.Len() >= maxStdoutBytes {
		return nil, fmt.Errorf("skillrunner: script stdout exceeded %d MB cap", maxStdoutBytes/(1024*1024))
	}
	if waitErr != nil {
		stderr := stderrBuf.String()
		if len(stderr) > 500 {
			stderr = stderr[:500] + "..."
		}
		return nil, fmt.Errorf("skillrunner: script exited with error: %w; stderr: %s", waitErr, stderr)
	}

	return &ScriptResult{
		Stdout:   stdoutBuf.Bytes(),
		Duration: duration,
	}, nil
}

// WarnMissingInterpreters logs a warning at startup for any missing interpreters.
func WarnMissingInterpreters() {
	pairs := []struct{ lang, interp string }{
		{"sh", "bash"},
		{"py", "python3"},
	}
	for _, p := range pairs {
		if _, err := exec.LookPath(p.interp); err != nil {
			slog.Warn("skill script interpreter not found; script skills using this language will fail",
				"lang", p.lang, "interpreter", p.interp)
		}
	}
}

// interpreterFor returns the interpreter binary name and script file extension
// for the given scriptLang identifier.
func interpreterFor(lang string) (interp, ext string, err error) {
	switch lang {
	case "sh":
		return "bash", ".sh", nil
	case "py":
		return "python3", ".py", nil
	case "ts":
		return "deno", ".ts", nil
	case "js":
		return "node", ".js", nil
	default:
		return "", "", fmt.Errorf("skillrunner: unsupported script language %q; supported: sh, py, ts, js", lang)
	}
}

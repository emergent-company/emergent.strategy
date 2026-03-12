package mcp

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"sort"
	"sync"
	"sync/atomic"
	"time"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"
)

const (
	// maxAuditEntries is the maximum number of audit log entries before FIFO eviction.
	maxAuditEntries = 1000

	// maxCallCountKeys is the maximum unique tool+params keys for anti-loop detection.
	maxCallCountKeys = 500
)

// AuditEntry records a single tool call in the session audit log.
type AuditEntry struct {
	CallID     string `json:"call_id"`
	ToolName   string `json:"tool_name"`
	ParamsHash string `json:"params_hash"`
	Timestamp  string `json:"timestamp"`
}

// AuditLog tracks all tool calls in a session with bounded memory.
type AuditLog struct {
	mu           sync.Mutex
	entries      []AuditEntry
	callCounter  atomic.Int64
	evictedCount int

	// Anti-loop detection: keyed by toolName+hash(params)
	callCounts   map[string]int
	callCountLRU []string // ordered by most recent use (newest at end)
}

// NewAuditLog creates a new bounded audit log.
func NewAuditLog() *AuditLog {
	return &AuditLog{
		entries:      make([]AuditEntry, 0, 128),
		callCounts:   make(map[string]int, 64),
		callCountLRU: make([]string, 0, 64),
	}
}

// Record adds a tool call to the audit log and returns the assigned call_id.
func (a *AuditLog) Record(toolName string, params map[string]any) string {
	callNum := a.callCounter.Add(1)
	callID := fmt.Sprintf("call-%d", callNum)
	paramsHash := hashParams(params)

	entry := AuditEntry{
		CallID:     callID,
		ToolName:   toolName,
		ParamsHash: paramsHash,
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	// FIFO eviction for audit entries
	if len(a.entries) >= maxAuditEntries {
		a.entries = a.entries[1:]
		a.evictedCount++
	}
	a.entries = append(a.entries, entry)

	// Update anti-loop detection
	loopKey := toolName
	if paramsHash != "" {
		loopKey += ":" + paramsHash
	}
	a.callCounts[loopKey]++
	a.touchLRU(loopKey)

	// LRU eviction for call count keys
	if len(a.callCounts) > maxCallCountKeys {
		a.evictLRU()
	}

	return callID
}

// CheckLoop returns a CallCountWarningInfo if the tool+params combo exceeds the loop threshold.
// Must be called after Record.
func (a *AuditLog) CheckLoop(toolName string, params map[string]any) *CallCountWarningInfo {
	paramsHash := hashParams(params)
	loopKey := toolName
	if paramsHash != "" {
		loopKey += ":" + paramsHash
	}

	a.mu.Lock()
	count := a.callCounts[loopKey]
	a.mu.Unlock()

	if count > loopThreshold {
		return buildCallCountWarning(toolName, count, suggestNextToolForLoop(toolName))
	}
	return nil
}

// CheckCircuitBreaker returns true if the tool+params combo has exceeded the
// circuit breaker threshold. When this returns true, the middleware should NOT
// execute the handler and should return an error response instead.
// Must be called after Record.
func (a *AuditLog) CheckCircuitBreaker(toolName string, params map[string]any) (bool, int) {
	paramsHash := hashParams(params)
	loopKey := toolName
	if paramsHash != "" {
		loopKey += ":" + paramsHash
	}

	a.mu.Lock()
	count := a.callCounts[loopKey]
	a.mu.Unlock()

	return count > circuitBreakerThreshold, count
}

// Summary returns a compact summary of the audit log (for default epf_session_audit response).
type AuditSummary struct {
	TotalCalls   int      `json:"total_calls"`
	UniqueTools  []string `json:"unique_tools"`
	EvictedCount int      `json:"evicted_count"`
}

// GetSummary returns a compact summary without individual entries.
func (a *AuditLog) GetSummary(toolNameFilter string) AuditSummary {
	a.mu.Lock()
	defer a.mu.Unlock()

	uniqueSet := make(map[string]struct{})
	totalCalls := 0

	for _, e := range a.entries {
		if toolNameFilter != "" && e.ToolName != toolNameFilter {
			continue
		}
		totalCalls++
		uniqueSet[e.ToolName] = struct{}{}
	}

	// If filtering, add evicted to total for accuracy indication
	// (we can't know how many evicted matched the filter)
	uniqueTools := make([]string, 0, len(uniqueSet))
	for t := range uniqueSet {
		uniqueTools = append(uniqueTools, t)
	}
	sort.Strings(uniqueTools)

	return AuditSummary{
		TotalCalls:   totalCalls,
		UniqueTools:  uniqueTools,
		EvictedCount: a.evictedCount,
	}
}

// AuditPage represents a paginated page of audit entries.
type AuditPage struct {
	AuditSummary
	Entries []AuditEntry `json:"entries"`
	HasMore bool         `json:"has_more"`
	Offset  int          `json:"offset"`
	Limit   int          `json:"limit"`
}

// GetPage returns a paginated slice of audit entries.
func (a *AuditLog) GetPage(toolNameFilter string, offset, limit int) AuditPage {
	if limit <= 0 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	// Filter entries
	var filtered []AuditEntry
	if toolNameFilter == "" {
		filtered = a.entries
	} else {
		filtered = make([]AuditEntry, 0)
		for _, e := range a.entries {
			if e.ToolName == toolNameFilter {
				filtered = append(filtered, e)
			}
		}
	}

	// Paginate
	total := len(filtered)
	if offset >= total {
		return AuditPage{
			AuditSummary: a.summaryUnlocked(toolNameFilter),
			Entries:      []AuditEntry{},
			HasMore:      false,
			Offset:       offset,
			Limit:        limit,
		}
	}

	end := offset + limit
	hasMore := false
	if end > total {
		end = total
	} else if end < total {
		hasMore = true
	}

	page := make([]AuditEntry, end-offset)
	copy(page, filtered[offset:end])

	return AuditPage{
		AuditSummary: a.summaryUnlocked(toolNameFilter),
		Entries:      page,
		HasMore:      hasMore,
		Offset:       offset,
		Limit:        limit,
	}
}

// summaryUnlocked returns summary without acquiring the lock (caller must hold it).
func (a *AuditLog) summaryUnlocked(toolNameFilter string) AuditSummary {
	uniqueSet := make(map[string]struct{})
	totalCalls := 0

	for _, e := range a.entries {
		if toolNameFilter != "" && e.ToolName != toolNameFilter {
			continue
		}
		totalCalls++
		uniqueSet[e.ToolName] = struct{}{}
	}

	uniqueTools := make([]string, 0, len(uniqueSet))
	for t := range uniqueSet {
		uniqueTools = append(uniqueTools, t)
	}
	sort.Strings(uniqueTools)

	return AuditSummary{
		TotalCalls:   totalCalls,
		UniqueTools:  uniqueTools,
		EvictedCount: a.evictedCount,
	}
}

// Reset clears all audit state (log, counters, call ID).
func (a *AuditLog) Reset() {
	a.mu.Lock()
	a.entries = make([]AuditEntry, 0, 128)
	a.evictedCount = 0
	a.callCounts = make(map[string]int, 64)
	a.callCountLRU = make([]string, 0, 64)
	a.mu.Unlock()
	a.callCounter.Store(0)
}

// VerifyWorkflow checks which of the expected tools were called during the session.
type WorkflowVerification struct {
	Complete      bool                `json:"complete"`
	Called        []WorkflowToolEntry `json:"called"`
	Missing       []string            `json:"missing"`
	MissingCount  int                 `json:"missing_count"`
	CalledCount   int                 `json:"called_count"`
	TotalExpected int                 `json:"total_expected"`
}

// WorkflowToolEntry represents a called tool in the verification report.
type WorkflowToolEntry struct {
	ToolName  string `json:"tool_name"`
	CallCount int    `json:"call_count"`
}

// VerifyWorkflow checks expected tools against the audit log.
func (a *AuditLog) VerifyWorkflow(expectedTools []string) WorkflowVerification {
	a.mu.Lock()
	defer a.mu.Unlock()

	// Count calls per tool
	toolCounts := make(map[string]int)
	for _, e := range a.entries {
		toolCounts[e.ToolName]++
	}

	var called []WorkflowToolEntry
	var missing []string

	for _, tool := range expectedTools {
		if count, ok := toolCounts[tool]; ok && count > 0 {
			called = append(called, WorkflowToolEntry{ToolName: tool, CallCount: count})
		} else {
			missing = append(missing, tool)
		}
	}

	if called == nil {
		called = []WorkflowToolEntry{}
	}
	if missing == nil {
		missing = []string{}
	}

	return WorkflowVerification{
		Complete:      len(missing) == 0,
		Called:        called,
		Missing:       missing,
		MissingCount:  len(missing),
		CalledCount:   len(called),
		TotalExpected: len(expectedTools),
	}
}

// --- LRU helpers for call count eviction ---

// touchLRU moves a key to the end of the LRU list (most recently used).
func (a *AuditLog) touchLRU(key string) {
	// Remove existing occurrence
	for i, k := range a.callCountLRU {
		if k == key {
			a.callCountLRU = append(a.callCountLRU[:i], a.callCountLRU[i+1:]...)
			break
		}
	}
	a.callCountLRU = append(a.callCountLRU, key)
}

// evictLRU removes the least recently used call count key.
func (a *AuditLog) evictLRU() {
	if len(a.callCountLRU) == 0 {
		return
	}
	oldest := a.callCountLRU[0]
	a.callCountLRU = a.callCountLRU[1:]
	delete(a.callCounts, oldest)
}

// --- Parameter hashing ---

// hashParams creates a stable hash of tool parameters for deduplication.
func hashParams(params map[string]any) string {
	if len(params) == 0 {
		return ""
	}

	sortedKeys := make([]string, 0, len(params))
	for k := range params {
		sortedKeys = append(sortedKeys, k)
	}
	sort.Strings(sortedKeys)

	h := sha256.New()
	for _, k := range sortedKeys {
		h.Write([]byte(k))
		h.Write([]byte("="))
		v, _ := json.Marshal(params[k])
		h.Write(v)
		h.Write([]byte(";"))
	}
	return fmt.Sprintf("%x", h.Sum(nil))[:16]
}

// --- Middleware ---

// contextKey is an unexported type for context keys in this package.
type contextKey struct{ name string }

var (
	// auditCallIDKey stores the call_id assigned to the current tool invocation.
	auditCallIDKey = &contextKey{"audit-call-id"}
	// auditLoopWarningKey stores any loop warning for the current tool invocation.
	auditLoopWarningKey = &contextKey{"audit-loop-warning"}
)

// CallIDFromContext retrieves the call_id assigned by the audit middleware.
// Returns empty string if not available (e.g., middleware not installed).
func CallIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(auditCallIDKey).(string); ok {
		return v
	}
	return ""
}

// LoopWarningFromContext retrieves any loop warning from the audit middleware.
// Returns nil if no loop was detected.
func LoopWarningFromContext(ctx context.Context) *CallCountWarningInfo {
	if v, ok := ctx.Value(auditLoopWarningKey).(*CallCountWarningInfo); ok {
		return v
	}
	return nil
}

// AuditMiddleware creates an mcp-go ToolHandlerMiddleware that:
// 1. Records every tool call in the audit log
// 2. Detects loops (identical tool+params called 3+ times)
// 3. Injects _call_id into the response
// 4. Injects call_count_warning for tools that DON'T handle it themselves
//
// Tools with custom preamble logic (health_check, validate_file) can retrieve
// the loop warning via LoopWarningFromContext(ctx) and handle it themselves.
// The middleware stores the warning in context before calling the handler.
func AuditMiddleware(audit *AuditLog) server.ToolHandlerMiddleware {
	return func(next server.ToolHandlerFunc) server.ToolHandlerFunc {
		return func(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
			toolName := request.Params.Name
			params := request.GetArguments()

			// Record in audit log (also updates loop detection)
			callID := audit.Record(toolName, params)

			// Circuit breaker: block execution after too many identical calls.
			// This prevents infinite loops where models ignore call_count_warning.
			if blocked, count := audit.CheckCircuitBreaker(toolName, params); blocked {
				suggested := suggestNextToolForLoop(toolName)
				msg := fmt.Sprintf(
					"BLOCKED: You have called %s with identical parameters %d times. "+
						"This is a loop. The tool will not execute. "+
						"Proceed to the next step in your workflow",
					toolName, count,
				)
				if suggested != "" {
					msg += fmt.Sprintf(": call %s", suggested)
				}
				msg += "."

				result := &mcp.CallToolResult{
					Content: []mcp.Content{mcp.NewTextContent(msg)},
					IsError: true,
				}
				injectCallID(result, callID)
				return result, nil
			}

			// Check for loop warning (softer than circuit breaker)
			loopWarning := audit.CheckLoop(toolName, params)

			// Store call_id and loop warning in context so handlers can access them
			ctx = context.WithValue(ctx, auditCallIDKey, callID)
			if loopWarning != nil {
				ctx = context.WithValue(ctx, auditLoopWarningKey, loopWarning)
			}

			// Call the actual handler
			result, err := next(ctx, request)
			if err != nil {
				return result, err
			}

			// Inject _call_id into response
			if result != nil {
				injectCallID(result, callID)

				// Inject loop warning for tools that don't handle it themselves.
				// Tools with custom preamble logic read from context instead.
				if loopWarning != nil && !handlerManagesLoopWarning(toolName) {
					injectLoopWarning(result, loopWarning)
				}
			}

			return result, nil
		}
	}
}

// handlerManagesLoopWarning returns true for tools whose handlers read
// LoopWarningFromContext and build custom preambles. The middleware skips
// automatic injection for these tools to avoid duplicate warnings.
func handlerManagesLoopWarning(toolName string) bool {
	switch toolName {
	case "epf_validate_file", "epf_health_check", "epf_list_workspaces":
		return true
	default:
		return false
	}
}

// injectCallID adds _call_id to the first text content block in the response.
// If the content is JSON, it injects into the JSON object. Otherwise it prepends as text.
func injectCallID(result *mcp.CallToolResult, callID string) {
	if result == nil || len(result.Content) == 0 {
		return
	}

	for i, content := range result.Content {
		if textContent, ok := content.(mcp.TextContent); ok {
			text := textContent.Text

			// Try to inject into JSON object
			var obj map[string]any
			if json.Unmarshal([]byte(text), &obj) == nil {
				obj["_call_id"] = callID
				if updated, err := json.Marshal(obj); err == nil {
					result.Content[i] = mcp.NewTextContent(string(updated))
					return
				}
			}

			// For non-JSON text, prepend as a header line
			result.Content[i] = mcp.NewTextContent(fmt.Sprintf("[%s] %s", callID, text))
			return
		}
	}
}

// injectLoopWarning adds call_count_warning to JSON content or prepends as text.
func injectLoopWarning(result *mcp.CallToolResult, warning *CallCountWarningInfo) {
	if result == nil || len(result.Content) == 0 {
		return
	}

	for i, content := range result.Content {
		if textContent, ok := content.(mcp.TextContent); ok {
			text := textContent.Text

			// Try to inject into JSON object
			var obj map[string]any
			if json.Unmarshal([]byte(text), &obj) == nil {
				obj["call_count_warning"] = warning
				if updated, err := json.Marshal(obj); err == nil {
					result.Content[i] = mcp.NewTextContent(string(updated))
					return
				}
			}

			// For non-JSON text, prepend the warning message
			result.Content[i] = mcp.NewTextContent(warning.Message + "\n\n" + text)
			return
		}
	}
}

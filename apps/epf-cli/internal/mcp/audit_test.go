package mcp

import (
	"testing"
)

func TestAuditLog_Record(t *testing.T) {
	audit := NewAuditLog()

	callID := audit.Record("epf_health_check", map[string]any{"instance_path": "/test"})
	if callID != "call-1" {
		t.Errorf("Expected call-1, got %s", callID)
	}

	callID2 := audit.Record("epf_validate_file", map[string]any{"path": "/test.yaml"})
	if callID2 != "call-2" {
		t.Errorf("Expected call-2, got %s", callID2)
	}
}

func TestAuditLog_CallIDMonotonic(t *testing.T) {
	audit := NewAuditLog()

	for i := 1; i <= 10; i++ {
		callID := audit.Record("epf_health_check", map[string]any{"i": i})
		expected := "call-" + itoa(i)
		if callID != expected {
			t.Errorf("Expected %s, got %s", expected, callID)
		}
	}
}

func TestAuditLog_CheckLoop_BelowThreshold(t *testing.T) {
	audit := NewAuditLog()
	params := map[string]any{"instance_path": "/test/path"}

	// First call — no warning
	audit.Record("epf_health_check", params)
	warning := audit.CheckLoop("epf_health_check", params)
	if warning != nil {
		t.Error("Expected nil warning on first call")
	}

	// Second call — no warning
	audit.Record("epf_health_check", params)
	warning = audit.CheckLoop("epf_health_check", params)
	if warning != nil {
		t.Error("Expected nil warning on second call")
	}
}

func TestAuditLog_CheckLoop_ExceedsThreshold(t *testing.T) {
	audit := NewAuditLog()
	params := map[string]any{"instance_path": "/test/path"}

	// First two calls
	audit.Record("epf_health_check", params)
	audit.Record("epf_health_check", params)

	// Third call — should trigger
	audit.Record("epf_health_check", params)
	warning := audit.CheckLoop("epf_health_check", params)
	if warning == nil {
		t.Fatal("Expected warning on third call")
	}
	if warning.CallCount != 3 {
		t.Errorf("Expected CallCount=3, got %d", warning.CallCount)
	}
	if warning.ToolName != "epf_health_check" {
		t.Errorf("Expected ToolName='epf_health_check', got %q", warning.ToolName)
	}
}

func TestAuditLog_CheckLoop_DifferentParams(t *testing.T) {
	audit := NewAuditLog()

	// Call with different params each time — should never trigger
	for i := 0; i < 10; i++ {
		params := map[string]any{"instance_path": "/test/" + itoa(i)}
		audit.Record("epf_health_check", params)
		warning := audit.CheckLoop("epf_health_check", params)
		if warning != nil {
			t.Errorf("Expected nil warning for unique params on call %d", i+1)
		}
	}
}

func TestAuditLog_CheckLoop_DifferentTools(t *testing.T) {
	audit := NewAuditLog()
	params := map[string]any{"instance_path": "/test/path"}

	tools := []string{"epf_health_check", "epf_validate_file", "epf_get_wizard_for_task"}
	for _, tool := range tools {
		for i := 0; i < 2; i++ {
			audit.Record(tool, params)
			warning := audit.CheckLoop(tool, params)
			if warning != nil {
				t.Errorf("Expected nil warning for tool %q call %d", tool, i+1)
			}
		}
	}
}

func TestAuditLog_CheckLoop_NoParams(t *testing.T) {
	audit := NewAuditLog()

	audit.Record("epf_list_schemas", nil)
	audit.Record("epf_list_schemas", nil)
	audit.Record("epf_list_schemas", nil)
	warning := audit.CheckLoop("epf_list_schemas", nil)
	if warning == nil {
		t.Fatal("Expected warning on third call with nil params")
	}
	if warning.CallCount != 3 {
		t.Errorf("Expected CallCount=3, got %d", warning.CallCount)
	}
}

func TestAuditLog_CheckLoop_FourthCallIncrements(t *testing.T) {
	audit := NewAuditLog()
	params := map[string]any{"path": "/test"}

	for i := 0; i < 3; i++ {
		audit.Record("epf_validate_file", params)
	}

	// Fourth call
	audit.Record("epf_validate_file", params)
	warning := audit.CheckLoop("epf_validate_file", params)
	if warning == nil {
		t.Fatal("Expected warning on fourth call")
	}
	if warning.CallCount != 4 {
		t.Errorf("Expected CallCount=4, got %d", warning.CallCount)
	}
}

func TestAuditLog_Reset(t *testing.T) {
	audit := NewAuditLog()
	params := map[string]any{"instance_path": "/test/path"}

	audit.Record("epf_health_check", params)
	audit.Record("epf_health_check", params)

	audit.Reset()

	// After reset, third call should not trigger (counter was reset)
	audit.Record("epf_health_check", params)
	warning := audit.CheckLoop("epf_health_check", params)
	if warning != nil {
		t.Error("Expected nil warning after Reset")
	}

	// Call ID should restart from 1
	callID := audit.Record("epf_health_check", params)
	if callID != "call-2" {
		t.Errorf("Expected call-2 after reset (second record), got %s", callID)
	}
}

func TestAuditLog_FIFOEviction(t *testing.T) {
	audit := NewAuditLog()

	// Record more than maxAuditEntries
	for i := 0; i < maxAuditEntries+50; i++ {
		audit.Record("epf_health_check", map[string]any{"i": i})
	}

	summary := audit.GetSummary("")
	if summary.TotalCalls != maxAuditEntries {
		t.Errorf("Expected %d entries after eviction, got %d", maxAuditEntries, summary.TotalCalls)
	}
	if summary.EvictedCount != 50 {
		t.Errorf("Expected 50 evicted, got %d", summary.EvictedCount)
	}
}

func TestAuditLog_LRUEviction(t *testing.T) {
	audit := NewAuditLog()

	// Create maxCallCountKeys+1 unique keys
	for i := 0; i <= maxCallCountKeys; i++ {
		audit.Record("tool_"+itoa(i), nil)
	}

	// The map should not exceed maxCallCountKeys
	audit.mu.Lock()
	count := len(audit.callCounts)
	audit.mu.Unlock()

	if count > maxCallCountKeys {
		t.Errorf("Expected at most %d call count keys, got %d", maxCallCountKeys, count)
	}
}

func TestAuditLog_GetSummary(t *testing.T) {
	audit := NewAuditLog()

	audit.Record("epf_health_check", map[string]any{"path": "/a"})
	audit.Record("epf_validate_file", map[string]any{"path": "/b"})
	audit.Record("epf_health_check", map[string]any{"path": "/c"})

	summary := audit.GetSummary("")
	if summary.TotalCalls != 3 {
		t.Errorf("Expected 3 total calls, got %d", summary.TotalCalls)
	}
	if len(summary.UniqueTools) != 2 {
		t.Errorf("Expected 2 unique tools, got %d", len(summary.UniqueTools))
	}
}

func TestAuditLog_GetSummary_Filtered(t *testing.T) {
	audit := NewAuditLog()

	audit.Record("epf_health_check", nil)
	audit.Record("epf_validate_file", nil)
	audit.Record("epf_health_check", nil)

	summary := audit.GetSummary("epf_health_check")
	if summary.TotalCalls != 2 {
		t.Errorf("Expected 2 filtered calls, got %d", summary.TotalCalls)
	}
}

func TestAuditLog_GetPage(t *testing.T) {
	audit := NewAuditLog()

	for i := 0; i < 10; i++ {
		audit.Record("epf_tool_"+itoa(i%3), nil)
	}

	// First page
	page := audit.GetPage("", 0, 5)
	if len(page.Entries) != 5 {
		t.Errorf("Expected 5 entries, got %d", len(page.Entries))
	}
	if !page.HasMore {
		t.Error("Expected HasMore=true")
	}

	// Second page
	page2 := audit.GetPage("", 5, 5)
	if len(page2.Entries) != 5 {
		t.Errorf("Expected 5 entries, got %d", len(page2.Entries))
	}
	if page2.HasMore {
		t.Error("Expected HasMore=false")
	}
}

func TestAuditLog_GetPage_Filtered(t *testing.T) {
	audit := NewAuditLog()

	audit.Record("epf_health_check", nil)
	audit.Record("epf_validate_file", nil)
	audit.Record("epf_health_check", nil)

	page := audit.GetPage("epf_health_check", 0, 50)
	if len(page.Entries) != 2 {
		t.Errorf("Expected 2 filtered entries, got %d", len(page.Entries))
	}
}

func TestAuditLog_VerifyWorkflow_Complete(t *testing.T) {
	audit := NewAuditLog()

	audit.Record("epf_health_check", nil)
	audit.Record("epf_validate_file", nil)
	audit.Record("epf_get_wizard_for_task", nil)

	v := audit.VerifyWorkflow([]string{"epf_health_check", "epf_validate_file", "epf_get_wizard_for_task"})
	if !v.Complete {
		t.Error("Expected Complete=true")
	}
	if v.MissingCount != 0 {
		t.Errorf("Expected 0 missing, got %d", v.MissingCount)
	}
	if v.CalledCount != 3 {
		t.Errorf("Expected 3 called, got %d", v.CalledCount)
	}
}

func TestAuditLog_VerifyWorkflow_Incomplete(t *testing.T) {
	audit := NewAuditLog()

	audit.Record("epf_health_check", nil)

	v := audit.VerifyWorkflow([]string{"epf_health_check", "epf_validate_file", "epf_aim_status"})
	if v.Complete {
		t.Error("Expected Complete=false")
	}
	if v.MissingCount != 2 {
		t.Errorf("Expected 2 missing, got %d", v.MissingCount)
	}
	if len(v.Missing) != 2 {
		t.Errorf("Expected 2 missing tools, got %d", len(v.Missing))
	}
}

func TestAuditLog_VerifyWorkflow_Empty(t *testing.T) {
	audit := NewAuditLog()

	v := audit.VerifyWorkflow([]string{"epf_health_check"})
	if v.Complete {
		t.Error("Expected Complete=false for empty audit log")
	}
	if v.MissingCount != 1 {
		t.Errorf("Expected 1 missing, got %d", v.MissingCount)
	}
}

func TestAuditLog_SessionReset_ClearsAll(t *testing.T) {
	audit := NewAuditLog()

	// Record some calls
	audit.Record("epf_health_check", nil)
	audit.Record("epf_validate_file", nil)

	// Verify they're there
	summary := audit.GetSummary("")
	if summary.TotalCalls != 2 {
		t.Errorf("Expected 2 calls before reset, got %d", summary.TotalCalls)
	}

	// Reset
	audit.Reset()

	// Verify cleared
	summary = audit.GetSummary("")
	if summary.TotalCalls != 0 {
		t.Errorf("Expected 0 calls after reset, got %d", summary.TotalCalls)
	}
	if summary.EvictedCount != 0 {
		t.Errorf("Expected 0 evicted after reset, got %d", summary.EvictedCount)
	}

	// Verify workflow also empty
	v := audit.VerifyWorkflow([]string{"epf_health_check"})
	if v.Complete {
		t.Error("Expected incomplete after reset")
	}
}

func TestAuditLog_CheckCircuitBreaker_BelowThreshold(t *testing.T) {
	audit := NewAuditLog()
	params := map[string]any{"path": "/test"}

	// Calls 1-4 should NOT trigger circuit breaker (threshold is 4)
	for i := 0; i < 4; i++ {
		audit.Record("epf_health_check", params)
		blocked, _ := audit.CheckCircuitBreaker("epf_health_check", params)
		if blocked {
			t.Errorf("Should not be blocked at call %d", i+1)
		}
	}
}

func TestAuditLog_CheckCircuitBreaker_ExceedsThreshold(t *testing.T) {
	audit := NewAuditLog()
	params := map[string]any{"path": "/test"}

	// Make 5 identical calls
	for i := 0; i < 5; i++ {
		audit.Record("epf_health_check", params)
	}

	blocked, count := audit.CheckCircuitBreaker("epf_health_check", params)
	if !blocked {
		t.Error("Should be blocked after 5 identical calls")
	}
	if count != 5 {
		t.Errorf("Expected count 5, got %d", count)
	}
}

func TestAuditLog_CheckCircuitBreaker_DifferentParams(t *testing.T) {
	audit := NewAuditLog()

	// Make 5 calls with different params — no circuit breaker
	for i := 0; i < 5; i++ {
		audit.Record("epf_health_check", map[string]any{"path": itoa(i)})
	}

	blocked, _ := audit.CheckCircuitBreaker("epf_health_check", map[string]any{"path": "0"})
	if blocked {
		t.Error("Should not be blocked when params differ each time")
	}
}

func TestAuditLog_CheckCircuitBreaker_ResetClears(t *testing.T) {
	audit := NewAuditLog()
	params := map[string]any{"path": "/test"}

	// Make 5 identical calls to trigger circuit breaker
	for i := 0; i < 5; i++ {
		audit.Record("epf_health_check", params)
	}

	blocked, _ := audit.CheckCircuitBreaker("epf_health_check", params)
	if !blocked {
		t.Error("Should be blocked before reset")
	}

	// Reset should clear circuit breaker
	audit.Reset()

	blocked, _ = audit.CheckCircuitBreaker("epf_health_check", params)
	if blocked {
		t.Error("Should not be blocked after reset")
	}
}

// itoa is a simple int to string converter for test helpers.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	result := ""
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		result = string(rune('0'+n%10)) + result
		n /= 10
	}
	if neg {
		result = "-" + result
	}
	return result
}

package memory

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

// Memory's delete handler binds {"reason": ...}; "delete_reason" is silently
// ignored, so the tombstone audit trail was always empty (#87 F5).
func TestDeleteObject_SendsReasonField(t *testing.T) {
	var body map[string]any
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		_, _ = w.Write([]byte(`{}`))
	}))
	if err := c.DeleteObject(context.Background(), "obj-1", DeleteObjectRequest{Reason: "why"}); err != nil {
		t.Fatal(err)
	}
	if body["reason"] != "why" {
		t.Errorf("body = %v, want reason=why", body)
	}
	if _, bad := body["delete_reason"]; bad {
		t.Errorf("body still carries delete_reason: %v", body)
	}
}

func TestSearch_SendsLabels(t *testing.T) {
	var body map[string]any
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &body)
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	if _, err := c.Search(context.Background(), SearchRequest{Query: "q", Labels: []string{"instance:abc"}}); err != nil {
		t.Fatal(err)
	}
	labels, _ := body["labels"].([]any)
	if len(labels) != 1 || labels[0] != "instance:abc" {
		t.Errorf("labels = %v, want [instance:abc]", body["labels"])
	}
}

func TestListObjects_SendsLabelQuery(t *testing.T) {
	var query string
	c := newTestClient(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		query = r.URL.RawQuery
		_, _ = w.Write([]byte(`{"items":[]}`))
	}))
	if _, err := c.ListObjects(context.Background(), ListObjectsOptions{Label: "instance:abc"}); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(query, "label=instance%3Aabc") {
		t.Errorf("query = %q, want label=instance:abc", query)
	}
}

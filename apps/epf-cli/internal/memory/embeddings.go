package memory

import (
	"context"
	"fmt"
)

// EmbeddingProgress represents the embedding job queue progress.
type EmbeddingProgress struct {
	Pending    int `json:"pending"`
	Processing int `json:"processing"`
	Completed  int `json:"completed"`
	Failed     int `json:"failed"`
	Total      int `json:"total"`
}

// GetEmbeddingProgress returns the embedding job queue progress for the project.
func (c *Client) GetEmbeddingProgress(ctx context.Context) (*EmbeddingProgress, error) {
	var result EmbeddingProgress
	if err := c.do(ctx, "GET", "/api/embeddings/progress", nil, &result); err != nil {
		return nil, fmt.Errorf("get embedding progress: %w", err)
	}
	return &result, nil
}

// EmbeddingProgressPercent returns the percentage of embeddings completed.
// Returns -1 if progress cannot be determined (e.g., API not available).
func (c *Client) EmbeddingProgressPercent(ctx context.Context) float64 {
	prog, err := c.GetEmbeddingProgress(ctx)
	if err != nil || prog.Total == 0 {
		return -1
	}
	return float64(prog.Completed) / float64(prog.Total) * 100
}

// Package handler — postcommit.go
//
// Re-exports the shared PostCommitPipeline from internal/pipeline so that
// handler code can use it without an extra import path.
package handler

import (
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/pipeline"
)

// PostCommitPipeline is the shared post-commit hook that runs after every batch
// commit, regardless of commit origin (MCP or web UI).
// See internal/pipeline/postcommit.go for the full implementation.
type PostCommitPipeline = pipeline.PostCommitPipeline

// PostCommitResult summarises what the pipeline did.
type PostCommitResult = pipeline.PostCommitResult

// IngestEnqueuer is the interface for the Memory ingest enqueuer.
type IngestEnqueuer = pipeline.IngestEnqueuer

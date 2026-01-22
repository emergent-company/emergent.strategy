package e2e

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/domain/chunks"
	"github.com/emergent/emergent-core/internal/testutil"
)

// ChunksTestSuite tests the chunks API endpoints
type ChunksTestSuite struct {
	suite.Suite
	testDB *testutil.TestDB
	server *testutil.TestServer
	ctx    context.Context
}

func TestChunksSuite(t *testing.T) {
	suite.Run(t, new(ChunksTestSuite))
}

func (s *ChunksTestSuite) SetupSuite() {
	s.ctx = context.Background()

	// Create isolated test database with NestJS migrations
	testDB, err := testutil.SetupTestDB(s.ctx, "chunks")
	s.Require().NoError(err, "Failed to setup test database")
	s.testDB = testDB

	// Create test server
	s.server = testutil.NewTestServer(testDB)
}

func (s *ChunksTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *ChunksTestSuite) SetupTest() {
	// Truncate tables before each test
	err := testutil.TruncateTables(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Set up test fixtures (users, project, org)
	err = testutil.SetupTestFixtures(s.ctx, s.testDB.DB)
	s.Require().NoError(err)

	// Create test project
	err = testutil.CreateTestProject(s.ctx, s.testDB.DB, testutil.DefaultTestProject, testutil.AdminUser.ID)
	s.Require().NoError(err)
}

// Helper to create a test document and return its ID
func (s *ChunksTestSuite) createTestDocument(projectID string) string {
	docID := uuid.New().String()
	_, err := s.testDB.DB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.documents (id, project_id, filename, source_type, content_hash, file_size_bytes, sync_version, created_at, updated_at)
		VALUES ($1, $2, 'test-doc.txt', 'upload', $3, 1000, 1, now(), now())
	`, docID, projectID, uuid.NewString())
	s.Require().NoError(err)
	return docID
}

// Helper to create a test chunk and return its ID
func (s *ChunksTestSuite) createTestChunk(documentID string, chunkIndex int, text string) string {
	chunkID := uuid.New().String()
	_, err := s.testDB.DB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.chunks (id, document_id, chunk_index, text, created_at, updated_at)
		VALUES ($1, $2, $3, $4, now(), now())
	`, chunkID, documentID, chunkIndex, text)
	s.Require().NoError(err)
	return chunkID
}

// ============= List Tests =============

func (s *ChunksTestSuite) TestListChunks_RequiresAuth() {
	resp := s.server.GET("/api/v2/chunks",
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)
	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *ChunksTestSuite) TestListChunks_RequiresProjectID() {
	resp := s.server.GET("/api/v2/chunks",
		testutil.WithAuth("e2e-test-user"),
	)
	// RequireProjectID middleware returns 400 for missing header
	s.Equal(http.StatusBadRequest, resp.Code)
}

func (s *ChunksTestSuite) TestListChunks_RequiresChunksReadScope() {
	// User without chunks:read scope should be forbidden
	resp := s.server.GET("/api/v2/chunks",
		testutil.WithAuth("no-scope"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)
	s.Equal(http.StatusForbidden, resp.Code)
}

func (s *ChunksTestSuite) TestListChunks_Empty() {
	resp := s.server.GET("/api/v2/chunks",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)
	s.Equal(http.StatusOK, resp.Code)

	var result chunks.ListChunksResponse
	err := json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)
	s.Empty(result.Data)
	s.Equal(0, result.TotalCount)
}

func (s *ChunksTestSuite) TestListChunks_ReturnsChunks() {
	// Create document and chunks
	docID := s.createTestDocument(testutil.DefaultTestProject.ID)
	s.createTestChunk(docID, 0, "First chunk text")
	s.createTestChunk(docID, 1, "Second chunk text")

	resp := s.server.GET("/api/v2/chunks",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)
	s.Equal(http.StatusOK, resp.Code)

	var result chunks.ListChunksResponse
	err := json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)
	s.Len(result.Data, 2)
	s.Equal(2, result.TotalCount)

	// Check first chunk
	s.Equal(docID, result.Data[0].DocumentID)
	s.Equal(0, result.Data[0].Index)
	s.Equal("First chunk text", result.Data[0].Text)
	s.Equal(16, result.Data[0].Size) // len("First chunk text")
	s.False(result.Data[0].HasEmbedding)
}

func (s *ChunksTestSuite) TestListChunks_FilterByDocumentID() {
	// Create two documents with chunks
	doc1ID := s.createTestDocument(testutil.DefaultTestProject.ID)
	doc2ID := s.createTestDocument(testutil.DefaultTestProject.ID)

	s.createTestChunk(doc1ID, 0, "Doc 1 Chunk 1")
	s.createTestChunk(doc1ID, 1, "Doc 1 Chunk 2")
	s.createTestChunk(doc2ID, 0, "Doc 2 Chunk 1")

	// Filter by doc1
	resp := s.server.GET(fmt.Sprintf("/api/v2/chunks?documentId=%s", doc1ID),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)
	s.Equal(http.StatusOK, resp.Code)

	var result chunks.ListChunksResponse
	err := json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)
	s.Len(result.Data, 2)

	for _, chunk := range result.Data {
		s.Equal(doc1ID, chunk.DocumentID)
	}
}

func (s *ChunksTestSuite) TestListChunks_InvalidDocumentID() {
	resp := s.server.GET("/api/v2/chunks?documentId=invalid-uuid",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)
	s.Equal(http.StatusBadRequest, resp.Code)
}

func (s *ChunksTestSuite) TestListChunks_ProjectIsolation() {
	// Create chunk in user's project
	docID := s.createTestDocument(testutil.DefaultTestProject.ID)
	s.createTestChunk(docID, 0, "User's chunk")

	// Create another project and chunk
	otherProjectID := uuid.New().String()
	_, err := s.testDB.DB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.projects (id, name, organization_id, created_at, updated_at)
		VALUES ($1, 'Other Project', $2, NOW(), NOW())
	`, otherProjectID, testutil.DefaultTestProject.OrgID)
	s.Require().NoError(err)

	otherDocID := s.createTestDocument(otherProjectID)
	s.createTestChunk(otherDocID, 0, "Other's chunk")

	// Request with user's project should only see their chunk
	resp := s.server.GET("/api/v2/chunks",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)
	s.Equal(http.StatusOK, resp.Code)

	var result chunks.ListChunksResponse
	err = json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)
	s.Len(result.Data, 1)
	s.Equal("User's chunk", result.Data[0].Text)
}

// ============= Delete Tests =============

func (s *ChunksTestSuite) TestDeleteChunk_RequiresAuth() {
	resp := s.server.DELETE("/api/v2/chunks/" + uuid.NewString())
	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *ChunksTestSuite) TestDeleteChunk_RequiresProjectID() {
	resp := s.server.DELETE("/api/v2/chunks/"+uuid.NewString(),
		testutil.WithAuth("e2e-test-user"),
	)
	// RequireProjectID middleware returns 400 for missing header
	s.Equal(http.StatusBadRequest, resp.Code)
}

func (s *ChunksTestSuite) TestDeleteChunk_RequiresWriteScope() {
	// read-only token has chunks:read but not chunks:write
	resp := s.server.DELETE("/api/v2/chunks/"+uuid.NewString(),
		testutil.WithAuth("read-only"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)
	s.Equal(http.StatusForbidden, resp.Code)
}

func (s *ChunksTestSuite) TestDeleteChunk_Success() {
	docID := s.createTestDocument(testutil.DefaultTestProject.ID)
	chunkID := s.createTestChunk(docID, 0, "To be deleted")

	resp := s.server.DELETE("/api/v2/chunks/"+chunkID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)
	s.Equal(http.StatusNoContent, resp.Code)

	// Verify deleted
	var count int
	err := s.testDB.DB.DB.QueryRowContext(s.ctx, "SELECT COUNT(*) FROM kb.chunks WHERE id = $1", chunkID).Scan(&count)
	s.NoError(err)
	s.Equal(0, count)
}

func (s *ChunksTestSuite) TestDeleteChunk_NotFound() {
	resp := s.server.DELETE("/api/v2/chunks/"+uuid.NewString(),
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)
	s.Equal(http.StatusNotFound, resp.Code)
}

func (s *ChunksTestSuite) TestDeleteChunk_InvalidUUID() {
	resp := s.server.DELETE("/api/v2/chunks/invalid-uuid",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)
	s.Equal(http.StatusBadRequest, resp.Code)
}

func (s *ChunksTestSuite) TestDeleteChunk_ProjectIsolation() {
	// Create chunk in another project
	otherProjectID := uuid.New().String()
	_, err := s.testDB.DB.DB.ExecContext(s.ctx, `
		INSERT INTO kb.projects (id, name, organization_id, created_at, updated_at)
		VALUES ($1, 'Other Project', $2, NOW(), NOW())
	`, otherProjectID, testutil.DefaultTestProject.OrgID)
	s.Require().NoError(err)

	otherDocID := s.createTestDocument(otherProjectID)
	otherChunkID := s.createTestChunk(otherDocID, 0, "Other's chunk")

	// Try to delete with user's project
	resp := s.server.DELETE("/api/v2/chunks/"+otherChunkID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)
	s.Equal(http.StatusNotFound, resp.Code)

	// Verify chunk still exists
	var count int
	err = s.testDB.DB.DB.QueryRowContext(s.ctx, "SELECT COUNT(*) FROM kb.chunks WHERE id = $1", otherChunkID).Scan(&count)
	s.NoError(err)
	s.Equal(1, count)
}

// ============= Bulk Delete Tests =============

func (s *ChunksTestSuite) TestBulkDeleteChunks_Success() {
	docID := s.createTestDocument(testutil.DefaultTestProject.ID)
	chunk1ID := s.createTestChunk(docID, 0, "Chunk 1")
	chunk2ID := s.createTestChunk(docID, 1, "Chunk 2")

	resp := s.server.DELETE("/api/v2/chunks",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
		testutil.WithJSONBody(map[string]any{
			"ids": []string{chunk1ID, chunk2ID},
		}),
	)
	s.Equal(http.StatusOK, resp.Code)

	var result chunks.BulkDeletionSummary
	err := json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)
	s.Equal(2, result.TotalRequested)
	s.Equal(2, result.TotalDeleted)
	s.Equal(0, result.TotalFailed)
}

func (s *ChunksTestSuite) TestBulkDeleteChunks_EmptyArray() {
	resp := s.server.DELETE("/api/v2/chunks",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
		testutil.WithJSONBody(map[string]any{
			"ids": []string{},
		}),
	)
	s.Equal(http.StatusBadRequest, resp.Code)
}

func (s *ChunksTestSuite) TestBulkDeleteChunks_PartialNotFound() {
	docID := s.createTestDocument(testutil.DefaultTestProject.ID)
	chunkID := s.createTestChunk(docID, 0, "Exists")
	nonExistentID := uuid.NewString()

	resp := s.server.DELETE("/api/v2/chunks",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
		testutil.WithJSONBody(map[string]any{
			"ids": []string{chunkID, nonExistentID},
		}),
	)
	s.Equal(http.StatusOK, resp.Code)

	var result chunks.BulkDeletionSummary
	err := json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)
	s.Equal(2, result.TotalRequested)
	s.Equal(1, result.TotalDeleted)
	s.Equal(1, result.TotalFailed)
}

// ============= Delete By Document Tests =============

func (s *ChunksTestSuite) TestDeleteByDocument_Success() {
	docID := s.createTestDocument(testutil.DefaultTestProject.ID)
	s.createTestChunk(docID, 0, "Chunk 1")
	s.createTestChunk(docID, 1, "Chunk 2")
	s.createTestChunk(docID, 2, "Chunk 3")

	resp := s.server.DELETE("/api/v2/chunks/by-document/"+docID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)
	s.Equal(http.StatusOK, resp.Code)

	var result chunks.DocumentChunksDeletionResult
	err := json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)
	s.Equal(docID, result.DocumentID)
	s.Equal(3, result.ChunksDeleted)
	s.True(result.Success)
}

func (s *ChunksTestSuite) TestDeleteByDocument_NoChunks() {
	docID := s.createTestDocument(testutil.DefaultTestProject.ID)
	// No chunks created

	resp := s.server.DELETE("/api/v2/chunks/by-document/"+docID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)
	s.Equal(http.StatusOK, resp.Code)

	var result chunks.DocumentChunksDeletionResult
	err := json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)
	s.Equal(0, result.ChunksDeleted)
	s.True(result.Success)
}

func (s *ChunksTestSuite) TestDeleteByDocument_InvalidUUID() {
	resp := s.server.DELETE("/api/v2/chunks/by-document/invalid-uuid",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)
	s.Equal(http.StatusBadRequest, resp.Code)
}

// ============= Bulk Delete By Documents Tests =============

func (s *ChunksTestSuite) TestBulkDeleteByDocuments_Success() {
	doc1ID := s.createTestDocument(testutil.DefaultTestProject.ID)
	doc2ID := s.createTestDocument(testutil.DefaultTestProject.ID)
	s.createTestChunk(doc1ID, 0, "Doc 1 Chunk")
	s.createTestChunk(doc2ID, 0, "Doc 2 Chunk 1")
	s.createTestChunk(doc2ID, 1, "Doc 2 Chunk 2")

	resp := s.server.DELETE("/api/v2/chunks/by-documents",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
		testutil.WithJSONBody(map[string]any{
			"documentIds": []string{doc1ID, doc2ID},
		}),
	)
	s.Equal(http.StatusOK, resp.Code)

	var result chunks.BulkDocumentChunksDeletionSummary
	err := json.Unmarshal(resp.Body.Bytes(), &result)
	s.NoError(err)
	s.Equal(2, result.TotalDocuments)
	s.Equal(3, result.TotalChunks)
	s.Len(result.Results, 2)
}

func (s *ChunksTestSuite) TestBulkDeleteByDocuments_EmptyArray() {
	resp := s.server.DELETE("/api/v2/chunks/by-documents",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
		testutil.WithJSONBody(map[string]any{
			"documentIds": []string{},
		}),
	)
	s.Equal(http.StatusBadRequest, resp.Code)
}

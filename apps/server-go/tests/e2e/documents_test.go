package e2e

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/internal/testutil"
)

// DocumentsTestSuite tests the documents API endpoints
type DocumentsTestSuite struct {
	suite.Suite
	testDB *testutil.TestDB
	server *testutil.TestServer
	ctx    context.Context
}

func TestDocumentsSuite(t *testing.T) {
	suite.Run(t, new(DocumentsTestSuite))
}

func (s *DocumentsTestSuite) SetupSuite() {
	s.ctx = context.Background()

	// Create isolated test database with NestJS migrations
	testDB, err := testutil.SetupTestDB(s.ctx, "documents")
	s.Require().NoError(err, "Failed to setup test database")
	s.testDB = testDB

	// Create test server
	s.server = testutil.NewTestServer(testDB)
}

func (s *DocumentsTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *DocumentsTestSuite) SetupTest() {
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

// =============================================================================
// Test: Authentication & Authorization
// =============================================================================

func (s *DocumentsTestSuite) TestListDocuments_RequiresAuth() {
	// Request without Authorization header should fail
	resp := s.server.GET("/api/v2/documents",
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *DocumentsTestSuite) TestListDocuments_RequiresDocumentsReadScope() {
	// User without documents:read scope should be forbidden
	resp := s.server.GET("/api/v2/documents",
		testutil.WithAuth("no-scope"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusForbidden, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Equal("forbidden", errObj["code"])
}

func (s *DocumentsTestSuite) TestListDocuments_RequiresProjectID() {
	// Request without X-Project-ID should fail
	resp := s.server.GET("/api/v2/documents",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusBadRequest, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "project")
}

// =============================================================================
// Test: List Documents
// =============================================================================

func (s *DocumentsTestSuite) TestListDocuments_Empty() {
	// List documents when none exist
	resp := s.server.GET("/api/v2/documents",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	docs, ok := body["documents"].([]any)
	s.True(ok)
	s.Len(docs, 0)
	s.Equal(float64(0), body["total"])
}

func (s *DocumentsTestSuite) TestListDocuments_ReturnsDocuments() {
	// Create test documents
	doc1 := testutil.TestDocument{
		ID:        "00000000-0000-0000-0000-000000000001",
		ProjectID: testutil.DefaultTestProject.ID,
		Filename:  testutil.StringPtr("Test Document 1"),
		MimeType:  testutil.StringPtr("text/plain"),
	}
	doc2 := testutil.TestDocument{
		ID:        "00000000-0000-0000-0000-000000000002",
		ProjectID: testutil.DefaultTestProject.ID,
		Filename:  testutil.StringPtr("Test Document 2"),
		MimeType:  testutil.StringPtr("application/pdf"),
	}

	err := testutil.CreateTestDocument(s.ctx, s.testDB.DB, doc1)
	s.Require().NoError(err)
	err = testutil.CreateTestDocument(s.ctx, s.testDB.DB, doc2)
	s.Require().NoError(err)

	// List documents
	resp := s.server.GET("/api/v2/documents",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	docs, ok := body["documents"].([]any)
	s.True(ok)
	s.Len(docs, 2)
	s.Equal(float64(2), body["total"])
}

func (s *DocumentsTestSuite) TestListDocuments_ProjectIsolation() {
	// Create document in a different project
	otherProject := testutil.TestProject{
		ID:    "00000000-0000-0000-0000-000000000999",
		Name:  "Other Project",
		OrgID: testutil.DefaultTestProject.OrgID,
	}
	err := testutil.CreateTestProject(s.ctx, s.testDB.DB, otherProject, testutil.AdminUser.ID)
	s.Require().NoError(err)

	// Create document in default project
	doc1 := testutil.TestDocument{
		ID:        "00000000-0000-0000-0000-000000000001",
		ProjectID: testutil.DefaultTestProject.ID,
		Filename:  testutil.StringPtr("Doc in Default Project"),
	}
	// Create document in other project
	doc2 := testutil.TestDocument{
		ID:        "00000000-0000-0000-0000-000000000002",
		ProjectID: otherProject.ID,
		Filename:  testutil.StringPtr("Doc in Other Project"),
	}

	err = testutil.CreateTestDocument(s.ctx, s.testDB.DB, doc1)
	s.Require().NoError(err)
	err = testutil.CreateTestDocument(s.ctx, s.testDB.DB, doc2)
	s.Require().NoError(err)

	// List documents in default project - should only see doc1
	resp := s.server.GET("/api/v2/documents",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	docs, ok := body["documents"].([]any)
	s.True(ok)
	s.Len(docs, 1)
	s.Equal(float64(1), body["total"])

	firstDoc := docs[0].(map[string]any)
	s.Equal(doc1.ID, firstDoc["id"])
}

// =============================================================================
// Test: Filtering
// =============================================================================

func (s *DocumentsTestSuite) TestListDocuments_FilterBySourceType() {
	// Create documents with different source types
	doc1 := testutil.TestDocument{
		ID:         "00000000-0000-0000-0000-000000000001",
		ProjectID:  testutil.DefaultTestProject.ID,
		Filename:   testutil.StringPtr("Upload Doc"),
		SourceType: testutil.StringPtr("upload"),
	}
	doc2 := testutil.TestDocument{
		ID:         "00000000-0000-0000-0000-000000000002",
		ProjectID:  testutil.DefaultTestProject.ID,
		Filename:   testutil.StringPtr("Notion Doc"),
		SourceType: testutil.StringPtr("notion"),
	}
	doc3 := testutil.TestDocument{
		ID:         "00000000-0000-0000-0000-000000000003",
		ProjectID:  testutil.DefaultTestProject.ID,
		Filename:   testutil.StringPtr("Another Upload Doc"),
		SourceType: testutil.StringPtr("upload"),
	}

	err := testutil.CreateTestDocument(s.ctx, s.testDB.DB, doc1)
	s.Require().NoError(err)
	err = testutil.CreateTestDocument(s.ctx, s.testDB.DB, doc2)
	s.Require().NoError(err)
	err = testutil.CreateTestDocument(s.ctx, s.testDB.DB, doc3)
	s.Require().NoError(err)

	// Filter by sourceType=upload
	resp := s.server.GET("/api/v2/documents?sourceType=upload",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	docs, ok := body["documents"].([]any)
	s.True(ok)
	s.Len(docs, 2)
	s.Equal(float64(2), body["total"])
}

func (s *DocumentsTestSuite) TestListDocuments_FilterByIntegrationId() {
	// For now, skip this test - the data_source_integration_id has a FK constraint
	// and we'd need to create a data_source_integration record first
	s.T().Skip("Skipping - requires data_source_integrations FK setup")
}

func (s *DocumentsTestSuite) TestListDocuments_FilterRootOnly() {
	// Create parent and child documents
	parentDoc := testutil.TestDocument{
		ID:        "00000000-0000-0000-0000-000000000001",
		ProjectID: testutil.DefaultTestProject.ID,
		Filename:  testutil.StringPtr("Parent Document"),
	}
	childDoc := testutil.TestDocument{
		ID:               "00000000-0000-0000-0000-000000000002",
		ProjectID:        testutil.DefaultTestProject.ID,
		Filename:         testutil.StringPtr("Child Document"),
		ParentDocumentID: testutil.StringPtr(parentDoc.ID),
	}

	err := testutil.CreateTestDocument(s.ctx, s.testDB.DB, parentDoc)
	s.Require().NoError(err)
	err = testutil.CreateTestDocument(s.ctx, s.testDB.DB, childDoc)
	s.Require().NoError(err)

	// Filter by rootOnly=true
	resp := s.server.GET("/api/v2/documents?rootOnly=true",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	docs, ok := body["documents"].([]any)
	s.True(ok)
	s.Len(docs, 1)
	firstDoc := docs[0].(map[string]any)
	s.Equal(parentDoc.ID, firstDoc["id"])
}

func (s *DocumentsTestSuite) TestListDocuments_FilterByParentDocumentId() {
	// Create parent and child documents
	parentDoc := testutil.TestDocument{
		ID:        "00000000-0000-0000-0000-000000000001",
		ProjectID: testutil.DefaultTestProject.ID,
		Filename:  testutil.StringPtr("Parent Document"),
	}
	childDoc1 := testutil.TestDocument{
		ID:               "00000000-0000-0000-0000-000000000002",
		ProjectID:        testutil.DefaultTestProject.ID,
		Filename:         testutil.StringPtr("Child Document 1"),
		ParentDocumentID: testutil.StringPtr(parentDoc.ID),
	}
	childDoc2 := testutil.TestDocument{
		ID:               "00000000-0000-0000-0000-000000000003",
		ProjectID:        testutil.DefaultTestProject.ID,
		Filename:         testutil.StringPtr("Child Document 2"),
		ParentDocumentID: testutil.StringPtr(parentDoc.ID),
	}
	standAloneDoc := testutil.TestDocument{
		ID:        "00000000-0000-0000-0000-000000000004",
		ProjectID: testutil.DefaultTestProject.ID,
		Filename:  testutil.StringPtr("Stand Alone Document"),
	}

	err := testutil.CreateTestDocument(s.ctx, s.testDB.DB, parentDoc)
	s.Require().NoError(err)
	err = testutil.CreateTestDocument(s.ctx, s.testDB.DB, childDoc1)
	s.Require().NoError(err)
	err = testutil.CreateTestDocument(s.ctx, s.testDB.DB, childDoc2)
	s.Require().NoError(err)
	err = testutil.CreateTestDocument(s.ctx, s.testDB.DB, standAloneDoc)
	s.Require().NoError(err)

	// Filter by parentDocumentId
	resp := s.server.GET("/api/v2/documents?parentDocumentId="+parentDoc.ID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	docs, ok := body["documents"].([]any)
	s.True(ok)
	s.Len(docs, 2)
	s.Equal(float64(2), body["total"])
}

// =============================================================================
// Test: Pagination
// =============================================================================

func (s *DocumentsTestSuite) TestListDocuments_Limit() {
	// Create 5 documents
	for i := 1; i <= 5; i++ {
		doc := testutil.TestDocument{
			ID:        "00000000-0000-0000-0000-00000000000" + string(rune('0'+i)),
			ProjectID: testutil.DefaultTestProject.ID,
			Filename:  testutil.StringPtr("Document " + string(rune('0'+i))),
		}
		err := testutil.CreateTestDocument(s.ctx, s.testDB.DB, doc)
		s.Require().NoError(err)
	}

	// Request with limit=2
	resp := s.server.GET("/api/v2/documents?limit=2",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	docs, ok := body["documents"].([]any)
	s.True(ok)
	s.Len(docs, 2)
	s.Equal(float64(5), body["total"]) // Total should still be 5

	// Should have next cursor in header
	nextCursor := resp.Header().Get("x-next-cursor")
	s.NotEmpty(nextCursor, "Expected x-next-cursor header for pagination")
}

func (s *DocumentsTestSuite) TestListDocuments_CursorPagination() {
	// Create 5 documents with known timestamps
	baseTime := time.Now().Add(-5 * time.Hour)
	for i := 1; i <= 5; i++ {
		doc := testutil.TestDocument{
			ID:        "00000000-0000-0000-0000-00000000000" + string(rune('0'+i)),
			ProjectID: testutil.DefaultTestProject.ID,
			Filename:  testutil.StringPtr("Document " + string(rune('0'+i))),
		}
		// Each document created 1 hour apart
		createdAt := baseTime.Add(time.Duration(i) * time.Hour)
		err := testutil.CreateTestDocumentWithTimestamp(s.ctx, s.testDB.DB, doc, createdAt)
		s.Require().NoError(err)
	}

	// First page
	resp := s.server.GET("/api/v2/documents?limit=2",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	docs, ok := body["documents"].([]any)
	s.True(ok)
	s.Len(docs, 2)

	// Get cursor for next page
	nextCursor := resp.Header().Get("x-next-cursor")
	s.NotEmpty(nextCursor)

	// Second page using cursor
	resp = s.server.GET("/api/v2/documents?limit=2&cursor="+nextCursor,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusOK, resp.Code)

	err = json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	docs, ok = body["documents"].([]any)
	s.True(ok)
	s.Len(docs, 2)

	// Should have different documents
	firstPageFirst := docs[0].(map[string]any)["id"]
	s.NotEqual("00000000-0000-0000-0000-000000000005", firstPageFirst)
}

func (s *DocumentsTestSuite) TestListDocuments_CursorPaginationStress() {
	// Stress test: create many documents and verify cursor pagination walks all pages
	// without duplicates and with full coverage.
	// Ported from: documents.cursor-pagination-stress.e2e.spec.ts
	const totalDocs = 55
	const pageLimit = 5

	// Create documents with sequential timestamps
	baseTime := time.Now().Add(-time.Duration(totalDocs+1) * time.Hour)
	for i := 0; i < totalDocs; i++ {
		doc := testutil.TestDocument{
			ID:        fmt.Sprintf("00000000-0000-0000-0000-0000000000%02d", i),
			ProjectID: testutil.DefaultTestProject.ID,
			Filename:  testutil.StringPtr(fmt.Sprintf("stress-%d.txt", i)),
		}
		// Each document created 1 hour apart
		createdAt := baseTime.Add(time.Duration(i) * time.Hour)
		err := testutil.CreateTestDocumentWithTimestamp(s.ctx, s.testDB.DB, doc, createdAt)
		s.Require().NoError(err)
	}

	// Walk all pages and collect IDs
	seen := make(map[string]bool)
	var cursor string
	pages := 0
	totalFetched := 0
	maxPages := (totalDocs / pageLimit) + 2 // safety limit

	for {
		url := fmt.Sprintf("/api/v2/documents?limit=%d", pageLimit)
		if cursor != "" {
			url += "&cursor=" + cursor
		}

		resp := s.server.GET(url,
			testutil.WithAuth("e2e-test-user"),
			testutil.WithProjectID(testutil.DefaultTestProject.ID),
		)

		s.Equal(http.StatusOK, resp.Code, "Page %d should return 200", pages)

		var body map[string]any
		err := json.Unmarshal(resp.Body.Bytes(), &body)
		s.Require().NoError(err)

		docs, ok := body["documents"].([]any)
		s.True(ok)

		nextCursor := resp.Header().Get("x-next-cursor")

		if nextCursor != "" {
			// Intermediate pages should be fully populated
			s.Len(docs, pageLimit, "Intermediate page %d should have %d docs", pages, pageLimit)
		} else {
			// Final page must be non-empty and <= limit
			s.Greater(len(docs), 0, "Final page should not be empty")
			s.LessOrEqual(len(docs), pageLimit, "Final page should have <= %d docs", pageLimit)
		}

		// Check for duplicates
		for _, d := range docs {
			id := d.(map[string]any)["id"].(string)
			s.False(seen[id], "Document %s appeared twice (page %d)", id, pages)
			seen[id] = true
		}

		totalFetched += len(docs)
		pages++
		cursor = nextCursor

		// Safety guard against infinite loop
		s.LessOrEqual(pages, maxPages, "Pagination exceeded expected page count")

		if cursor == "" {
			break
		}
	}

	// Verify all documents were fetched
	s.Equal(totalDocs, totalFetched, "Should fetch all documents")
	s.Equal(totalDocs, len(seen), "Should see all unique documents")
}

func (s *DocumentsTestSuite) TestListDocuments_InvalidLimit() {
	// Request with limit > 500
	resp := s.server.GET("/api/v2/documents?limit=1000",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusBadRequest, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "limit")
}

func (s *DocumentsTestSuite) TestListDocuments_InvalidCursor() {
	// Request with invalid cursor
	resp := s.server.GET("/api/v2/documents?cursor=not-valid-base64!!!",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusBadRequest, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "cursor")
}

// =============================================================================
// Test: Get Document by ID
// =============================================================================

func (s *DocumentsTestSuite) TestGetDocument_Success() {
	doc := testutil.TestDocument{
		ID:        "00000000-0000-0000-0000-000000000001",
		ProjectID: testutil.DefaultTestProject.ID,
		Filename:  testutil.StringPtr("Test Document"),
		MimeType:  testutil.StringPtr("text/plain"),
		Content:   testutil.StringPtr("Hello, World!"),
	}

	err := testutil.CreateTestDocument(s.ctx, s.testDB.DB, doc)
	s.Require().NoError(err)

	resp := s.server.GET("/api/v2/documents/"+doc.ID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusOK, resp.Code)

	var body map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	s.Equal(doc.ID, body["id"])
	s.Equal(*doc.Filename, body["filename"])
	s.Equal("text/plain", body["mimeType"])
}

func (s *DocumentsTestSuite) TestGetDocument_NotFound() {
	resp := s.server.GET("/api/v2/documents/00000000-0000-0000-0000-000000000999",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusNotFound, resp.Code)

	var body map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Equal("not_found", errObj["code"])
}

func (s *DocumentsTestSuite) TestGetDocument_NotFoundInOtherProject() {
	// Create document in a different project
	otherProject := testutil.TestProject{
		ID:    "00000000-0000-0000-0000-000000000999",
		Name:  "Other Project",
		OrgID: testutil.DefaultTestProject.OrgID,
	}
	err := testutil.CreateTestProject(s.ctx, s.testDB.DB, otherProject, testutil.AdminUser.ID)
	s.Require().NoError(err)

	doc := testutil.TestDocument{
		ID:        "00000000-0000-0000-0000-000000000001",
		ProjectID: otherProject.ID,
		Filename:  testutil.StringPtr("Doc in Other Project"),
	}
	err = testutil.CreateTestDocument(s.ctx, s.testDB.DB, doc)
	s.Require().NoError(err)

	// Try to get document using different project ID - should return 404
	resp := s.server.GET("/api/v2/documents/"+doc.ID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusNotFound, resp.Code)
}

func (s *DocumentsTestSuite) TestGetDocument_RequiresAuth() {
	resp := s.server.GET("/api/v2/documents/00000000-0000-0000-0000-000000000001",
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *DocumentsTestSuite) TestGetDocument_RequiresProjectID() {
	resp := s.server.GET("/api/v2/documents/00000000-0000-0000-0000-000000000001",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusBadRequest, resp.Code)
}

func (s *DocumentsTestSuite) TestGetDocument_RequiresDocumentsReadScope() {
	resp := s.server.GET("/api/v2/documents/00000000-0000-0000-0000-000000000001",
		testutil.WithAuth("no-scope"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusForbidden, resp.Code)
}

// =============================================================================
// Test: Create Document
// =============================================================================

func (s *DocumentsTestSuite) TestCreateDocument_Success() {
	body := map[string]any{
		"filename": "test-document.txt",
		"content":  "Hello, World!",
	}

	resp := s.server.POST("/api/v2/documents",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusCreated, resp.Code)

	var respBody map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &respBody)
	s.NoError(err)

	s.NotEmpty(respBody["id"])
	s.Equal("test-document.txt", respBody["filename"])
	s.Equal("Hello, World!", respBody["content"])
	s.NotEmpty(respBody["contentHash"])
	s.Equal(testutil.DefaultTestProject.ID, respBody["projectId"])
}

func (s *DocumentsTestSuite) TestCreateDocument_DefaultFilename() {
	// Create document without filename - should default to "unnamed.txt"
	body := map[string]any{
		"content": "Some content",
	}

	resp := s.server.POST("/api/v2/documents",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusCreated, resp.Code)

	var respBody map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &respBody)
	s.NoError(err)

	s.Equal("unnamed.txt", respBody["filename"])
}

func (s *DocumentsTestSuite) TestCreateDocument_EmptyContent() {
	body := map[string]any{
		"filename": "empty-file.txt",
		"content":  "",
	}

	resp := s.server.POST("/api/v2/documents",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusCreated, resp.Code)

	var respBody map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &respBody)
	s.NoError(err)

	s.Equal("", respBody["content"])
}

func (s *DocumentsTestSuite) TestCreateDocument_Deduplication() {
	// Create first document
	body := map[string]any{
		"filename": "original.txt",
		"content":  "Same content for deduplication test",
	}

	resp := s.server.POST("/api/v2/documents",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusCreated, resp.Code)

	var firstDoc map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &firstDoc)
	s.NoError(err)
	firstID := firstDoc["id"].(string)

	// Create second document with same content
	body2 := map[string]any{
		"filename": "duplicate.txt",
		"content":  "Same content for deduplication test",
	}

	resp = s.server.POST("/api/v2/documents",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
		testutil.WithJSONBody(body2),
	)

	// Should return 200 (not 201) with the existing document
	s.Equal(http.StatusOK, resp.Code)

	var secondDoc map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &secondDoc)
	s.NoError(err)

	// Should return the first document (same ID)
	s.Equal(firstID, secondDoc["id"])
	s.Equal("original.txt", secondDoc["filename"]) // Original filename preserved
}

func (s *DocumentsTestSuite) TestCreateDocument_FilenameTooLong() {
	// Create filename longer than 512 characters
	longFilename := ""
	for i := 0; i < 600; i++ {
		longFilename += "a"
	}

	body := map[string]any{
		"filename": longFilename,
		"content":  "Some content",
	}

	resp := s.server.POST("/api/v2/documents",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusBadRequest, resp.Code)

	var respBody map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &respBody)
	s.NoError(err)

	errObj, ok := respBody["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "filename")
}

func (s *DocumentsTestSuite) TestCreateDocument_RequiresAuth() {
	body := map[string]any{
		"filename": "test.txt",
		"content":  "Content",
	}

	resp := s.server.POST("/api/v2/documents",
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *DocumentsTestSuite) TestCreateDocument_RequiresWriteScope() {
	body := map[string]any{
		"filename": "test.txt",
		"content":  "Content",
	}

	resp := s.server.POST("/api/v2/documents",
		testutil.WithAuth("read-only"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusForbidden, resp.Code)
}

func (s *DocumentsTestSuite) TestCreateDocument_RequiresProjectID() {
	body := map[string]any{
		"filename": "test.txt",
		"content":  "Content",
	}

	resp := s.server.POST("/api/v2/documents",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusBadRequest, resp.Code)
}

// =============================================================================
// Test: Delete Document
// =============================================================================

func (s *DocumentsTestSuite) TestDeleteDocument_Success() {
	// Create a document to delete
	doc := testutil.TestDocument{
		ID:        "00000000-0000-0000-0000-000000000001",
		ProjectID: testutil.DefaultTestProject.ID,
		Filename:  testutil.StringPtr("To Be Deleted"),
	}
	err := testutil.CreateTestDocument(s.ctx, s.testDB.DB, doc)
	s.Require().NoError(err)

	resp := s.server.DELETE("/api/v2/documents/"+doc.ID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusOK, resp.Code)

	var respBody map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &respBody)
	s.NoError(err)

	s.Equal("deleted", respBody["status"])
	s.NotNil(respBody["summary"])

	// Verify document is actually deleted
	getResp := s.server.GET("/api/v2/documents/"+doc.ID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)
	s.Equal(http.StatusNotFound, getResp.Code)
}

func (s *DocumentsTestSuite) TestDeleteDocument_NotFound() {
	resp := s.server.DELETE("/api/v2/documents/00000000-0000-0000-0000-000000000999",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusNotFound, resp.Code)
}

func (s *DocumentsTestSuite) TestDeleteDocument_InvalidUUID() {
	resp := s.server.DELETE("/api/v2/documents/not-a-uuid",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusBadRequest, resp.Code)

	var respBody map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &respBody)
	s.NoError(err)

	errObj, ok := respBody["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "Invalid")
}

func (s *DocumentsTestSuite) TestDeleteDocument_RequiresAuth() {
	resp := s.server.DELETE("/api/v2/documents/00000000-0000-0000-0000-000000000001",
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *DocumentsTestSuite) TestDeleteDocument_RequiresDeleteScope() {
	resp := s.server.DELETE("/api/v2/documents/00000000-0000-0000-0000-000000000001",
		testutil.WithAuth("read-only"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusForbidden, resp.Code)
}

func (s *DocumentsTestSuite) TestDeleteDocument_RequiresProjectID() {
	resp := s.server.DELETE("/api/v2/documents/00000000-0000-0000-0000-000000000001",
		testutil.WithAuth("e2e-test-user"),
	)

	s.Equal(http.StatusBadRequest, resp.Code)
}

func (s *DocumentsTestSuite) TestDeleteDocument_ProjectIsolation() {
	// Create document in other project
	otherProject := testutil.TestProject{
		ID:    "00000000-0000-0000-0000-000000000999",
		Name:  "Other Project",
		OrgID: testutil.DefaultTestProject.OrgID,
	}
	err := testutil.CreateTestProject(s.ctx, s.testDB.DB, otherProject, testutil.AdminUser.ID)
	s.Require().NoError(err)

	doc := testutil.TestDocument{
		ID:        "00000000-0000-0000-0000-000000000001",
		ProjectID: otherProject.ID,
		Filename:  testutil.StringPtr("Doc in Other Project"),
	}
	err = testutil.CreateTestDocument(s.ctx, s.testDB.DB, doc)
	s.Require().NoError(err)

	// Try to delete from different project - should return 404
	resp := s.server.DELETE("/api/v2/documents/"+doc.ID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)

	s.Equal(http.StatusNotFound, resp.Code)
}

// =============================================================================
// Test: Bulk Delete Documents
// =============================================================================

func (s *DocumentsTestSuite) TestBulkDeleteDocuments_Success() {
	// Create multiple documents
	doc1 := testutil.TestDocument{
		ID:        "00000000-0000-0000-0000-000000000001",
		ProjectID: testutil.DefaultTestProject.ID,
		Filename:  testutil.StringPtr("Doc 1"),
	}
	doc2 := testutil.TestDocument{
		ID:        "00000000-0000-0000-0000-000000000002",
		ProjectID: testutil.DefaultTestProject.ID,
		Filename:  testutil.StringPtr("Doc 2"),
	}
	doc3 := testutil.TestDocument{
		ID:        "00000000-0000-0000-0000-000000000003",
		ProjectID: testutil.DefaultTestProject.ID,
		Filename:  testutil.StringPtr("Doc 3"),
	}

	err := testutil.CreateTestDocument(s.ctx, s.testDB.DB, doc1)
	s.Require().NoError(err)
	err = testutil.CreateTestDocument(s.ctx, s.testDB.DB, doc2)
	s.Require().NoError(err)
	err = testutil.CreateTestDocument(s.ctx, s.testDB.DB, doc3)
	s.Require().NoError(err)

	body := map[string]any{
		"ids": []string{doc1.ID, doc2.ID},
	}

	resp := s.server.DELETE("/api/v2/documents",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusOK, resp.Code)

	var respBody map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &respBody)
	s.NoError(err)

	s.Equal("deleted", respBody["status"])
	s.Equal(float64(2), respBody["deleted"])

	// Verify documents are deleted, but doc3 remains
	getResp := s.server.GET("/api/v2/documents/"+doc1.ID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)
	s.Equal(http.StatusNotFound, getResp.Code)

	getResp = s.server.GET("/api/v2/documents/"+doc3.ID,
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
	)
	s.Equal(http.StatusOK, getResp.Code)
}

func (s *DocumentsTestSuite) TestBulkDeleteDocuments_PartialNotFound() {
	// Create one document
	doc1 := testutil.TestDocument{
		ID:        "00000000-0000-0000-0000-000000000001",
		ProjectID: testutil.DefaultTestProject.ID,
		Filename:  testutil.StringPtr("Doc 1"),
	}
	err := testutil.CreateTestDocument(s.ctx, s.testDB.DB, doc1)
	s.Require().NoError(err)

	// Try to delete one existing and one non-existing
	body := map[string]any{
		"ids": []string{doc1.ID, "00000000-0000-0000-0000-000000000999"},
	}

	resp := s.server.DELETE("/api/v2/documents",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusOK, resp.Code)

	var respBody map[string]any
	err = json.Unmarshal(resp.Body.Bytes(), &respBody)
	s.NoError(err)

	s.Equal("partial", respBody["status"])
	s.Equal(float64(1), respBody["deleted"])

	notFound, ok := respBody["notFound"].([]any)
	s.True(ok)
	s.Len(notFound, 1)
	s.Equal("00000000-0000-0000-0000-000000000999", notFound[0])
}

func (s *DocumentsTestSuite) TestBulkDeleteDocuments_EmptyArray() {
	body := map[string]any{
		"ids": []string{},
	}

	resp := s.server.DELETE("/api/v2/documents",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusBadRequest, resp.Code)

	var respBody map[string]any
	err := json.Unmarshal(resp.Body.Bytes(), &respBody)
	s.NoError(err)

	errObj, ok := respBody["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "ids")
}

func (s *DocumentsTestSuite) TestBulkDeleteDocuments_InvalidUUID() {
	body := map[string]any{
		"ids": []string{"not-a-uuid", "also-not-valid"},
	}

	resp := s.server.DELETE("/api/v2/documents",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusBadRequest, resp.Code)
}

func (s *DocumentsTestSuite) TestBulkDeleteDocuments_RequiresAuth() {
	body := map[string]any{
		"ids": []string{"00000000-0000-0000-0000-000000000001"},
	}

	resp := s.server.DELETE("/api/v2/documents",
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusUnauthorized, resp.Code)
}

func (s *DocumentsTestSuite) TestBulkDeleteDocuments_RequiresDeleteScope() {
	body := map[string]any{
		"ids": []string{"00000000-0000-0000-0000-000000000001"},
	}

	resp := s.server.DELETE("/api/v2/documents",
		testutil.WithAuth("read-only"),
		testutil.WithProjectID(testutil.DefaultTestProject.ID),
		testutil.WithJSONBody(body),
	)

	s.Equal(http.StatusForbidden, resp.Code)
}

package e2e

import (
	"net/http"
	"os"
	"testing"

	"github.com/stretchr/testify/suite"

	"github.com/emergent/emergent-core/internal/testutil"
)

// DocumentsUploadTestSuite tests the document upload API endpoints.
// This test suite is portable and can run against either Go or NestJS server implementations.
//
// Environment variables:
//   - TEST_SERVER_URL: External server URL (e.g., "http://localhost:3002" for Go, "http://localhost:3000" for NestJS)
//   - If not set, uses in-process Go test server (requires DB access)
//
// Note: These tests focus on authentication, authorization, and request validation.
// They use a dummy project ID since the actual project doesn't matter for validation tests.
type DocumentsUploadTestSuite struct {
	suite.Suite
	client *testutil.HTTPClient

	// For in-process testing only
	testDB *testutil.TestDB
	server *testutil.TestServer

	// Dummy project ID for validation tests (doesn't need to exist in DB)
	dummyProjectID string
}

func TestDocumentsUploadSuite(t *testing.T) {
	suite.Run(t, new(DocumentsUploadTestSuite))
}

func (s *DocumentsUploadTestSuite) SetupSuite() {
	// Use a fixed dummy project ID for validation tests
	s.dummyProjectID = "00000000-0000-0000-0000-000000000001"

	// Check if we're using external server
	if serverURL := os.Getenv("TEST_SERVER_URL"); serverURL != "" {
		s.T().Logf("Using external server: %s", serverURL)
		s.client = testutil.NewExternalHTTPClient(serverURL)
	} else {
		// Fall back to in-process server (requires DB)
		s.T().Log("Using in-process test server")

		testDB, err := testutil.SetupTestDB(s.Suite.T().Context(), "documents_upload")
		s.Require().NoError(err, "Failed to setup test database")
		s.testDB = testDB

		s.server = testutil.NewTestServer(testDB)
		s.client = testutil.NewHTTPClient(s.server.Echo)
	}
}

func (s *DocumentsUploadTestSuite) TearDownSuite() {
	if s.testDB != nil {
		s.testDB.Close()
	}
}

func (s *DocumentsUploadTestSuite) SetupTest() {
	// For in-process testing, reset DB state
	if s.testDB != nil {
		err := testutil.TruncateTables(s.Suite.T().Context(), s.testDB.DB)
		s.Require().NoError(err)

		err = testutil.SetupTestFixtures(s.Suite.T().Context(), s.testDB.DB)
		s.Require().NoError(err)
	}
	// For external server tests, we don't need to create anything
	// since these tests only verify auth/validation, not actual uploads
}

// =============================================================================
// Test: Single File Upload - Authentication & Authorization
// =============================================================================

func (s *DocumentsUploadTestSuite) TestUpload_RequiresAuth() {
	form := testutil.NewMultipartForm()
	form.AddFile("file", "test.txt", []byte("test content"))
	form.Close()

	resp := s.client.POST("/api/v2/documents/upload",
		testutil.WithProjectID(s.dummyProjectID),
		testutil.WithMultipartForm(form),
	)

	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *DocumentsUploadTestSuite) TestUpload_RequiresDocumentsWriteScope() {
	form := testutil.NewMultipartForm()
	form.AddFile("file", "test.txt", []byte("test content"))
	form.Close()

	// User without documents:write scope should be forbidden
	resp := s.client.POST("/api/v2/documents/upload",
		testutil.WithAuth("read-only"),
		testutil.WithProjectID(s.dummyProjectID),
		testutil.WithMultipartForm(form),
	)

	s.Equal(http.StatusForbidden, resp.StatusCode)

	var body map[string]any
	err := resp.JSON(&body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Equal("forbidden", errObj["code"])
}

func (s *DocumentsUploadTestSuite) TestUpload_RequiresProjectID() {
	form := testutil.NewMultipartForm()
	form.AddFile("file", "test.txt", []byte("test content"))
	form.Close()

	// Request without X-Project-ID should fail
	resp := s.client.POST("/api/v2/documents/upload",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithMultipartForm(form),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)

	var body map[string]any
	err := resp.JSON(&body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "x-project-id")
}

// =============================================================================
// Test: Single File Upload - Validation
// =============================================================================

func (s *DocumentsUploadTestSuite) TestUpload_RejectsWhenFileIsMissing() {
	// Create a multipart form without a file
	form := testutil.NewMultipartForm()
	form.AddField("someField", "someValue")
	form.Close()

	resp := s.client.POST("/api/v2/documents/upload",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.dummyProjectID),
		testutil.WithMultipartForm(form),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)

	var body map[string]any
	err := resp.JSON(&body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "file")
}

// =============================================================================
// Test: Batch Upload - Authentication & Authorization
// =============================================================================

func (s *DocumentsUploadTestSuite) TestBatchUpload_RequiresAuth() {
	form := testutil.NewMultipartForm()
	form.AddFile("files", "test1.txt", []byte("test content 1"))
	form.AddFile("files", "test2.txt", []byte("test content 2"))
	form.Close()

	resp := s.client.POST("/api/v2/documents/upload/batch",
		testutil.WithProjectID(s.dummyProjectID),
		testutil.WithMultipartForm(form),
	)

	s.Equal(http.StatusUnauthorized, resp.StatusCode)
}

func (s *DocumentsUploadTestSuite) TestBatchUpload_RequiresProjectID() {
	form := testutil.NewMultipartForm()
	form.AddFile("files", "test1.txt", []byte("test content 1"))
	form.Close()

	// Request without X-Project-ID should fail
	resp := s.client.POST("/api/v2/documents/upload/batch",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithMultipartForm(form),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)

	var body map[string]any
	err := resp.JSON(&body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "x-project-id")
}

func (s *DocumentsUploadTestSuite) TestBatchUpload_RequiresDocumentsWriteScope() {
	form := testutil.NewMultipartForm()
	form.AddFile("files", "test1.txt", []byte("test content 1"))
	form.Close()

	// User without documents:write scope should be forbidden
	resp := s.client.POST("/api/v2/documents/upload/batch",
		testutil.WithAuth("read-only"),
		testutil.WithProjectID(s.dummyProjectID),
		testutil.WithMultipartForm(form),
	)

	s.Equal(http.StatusForbidden, resp.StatusCode)

	var body map[string]any
	err := resp.JSON(&body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Equal("forbidden", errObj["code"])
}

// =============================================================================
// Test: Batch Upload - Validation
// =============================================================================

func (s *DocumentsUploadTestSuite) TestBatchUpload_RejectsWhenNoFilesProvided() {
	// Create a multipart form without any files
	form := testutil.NewMultipartForm()
	form.AddField("someField", "someValue")
	form.Close()

	resp := s.client.POST("/api/v2/documents/upload/batch",
		testutil.WithAuth("e2e-test-user"),
		testutil.WithProjectID(s.dummyProjectID),
		testutil.WithMultipartForm(form),
	)

	s.Equal(http.StatusBadRequest, resp.StatusCode)

	var body map[string]any
	err := resp.JSON(&body)
	s.NoError(err)

	errObj, ok := body["error"].(map[string]any)
	s.True(ok)
	s.Contains(errObj["message"], "at least one file")
}

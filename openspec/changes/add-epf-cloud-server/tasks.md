## 1. RepositoryProvider Abstraction

- [x] 1.1 Create `internal/source/source.go` — define `Source` interface (ReadFile, ReadDir, Walk, Stat)
- [x] 1.2 Create `internal/source/filesystem.go` — implement `FileSystemSource` wrapping os/filepath
- [x] 1.3 Create `internal/source/github.go` — implement `GitHubSource` using GitHub Contents API
- [x] 1.4 Create `internal/source/github_fs.go` — implement `fs.FS` adapter for GitHub API responses
- [x] 1.5 Create `internal/source/cache.go` — implement in-memory cache with TTL and Singleflight
- [x] 1.6 Refactor existing MCP handlers to accept `Source` interface instead of direct filesystem calls
- [x] 1.7 Write unit tests for FileSystemSource, GitHubSource (with mock HTTP), and cache
- [x] 1.8 Verify all existing tests pass with FileSystemSource (no behavior change)

## 2. HTTPS Remote Transport

- [x] 2.1 Add `--http` flag and `--port` flag to `serve` command
- [x] 2.2 Implement Streamable HTTP transport handler in `internal/transport/http.go`
- [x] 2.3 Implement SSE transport handler via mcp-go's built-in SSEServer (unified in `internal/transport/http.go`)
- [x] 2.4 Add CORS middleware with configurable allowed origins
- [x] 2.5 Add `/health` endpoint returning server status and loaded instance info
- [x] 2.6 Wire up MCP protocol over both transports (request/response + notifications)
- [x] 2.7 Write integration tests for Streamable HTTP transport with a test MCP client
- [x] 2.8 Write integration tests for SSE fallback transport
- [x] 2.9 Verify stdio transport still works unchanged

## 3. GitHub App Authentication

- [x] 3.1 Create EPF GitHub App in emergent-company org settings
- [x] 3.2 Create `internal/auth/githubapp.go` — JWT signing and installation token exchange
- [x] 3.3 Implement auto-rotation of installation tokens (refresh before expiry)
- [x] 3.4 Add configuration for App ID and private key path/secret reference
- [x] 3.5 Wire up `GitHubSource` to use installation tokens from auth package
- [x] 3.6 Write tests for JWT generation and token exchange (mock GitHub API)

## 4. GCP Cloud Run Deployment

- [x] 4.1 Create multi-stage Dockerfile (Go build + minimal runtime image)
- [x] 4.2 Set up GCP Artifact Registry repository for container images
- [x] 4.3 Configure Cloud Run service (env vars, Secret Manager mounts, scaling limits)
- [x] 4.4 Create `.github/workflows/deploy.yaml` — build and deploy on push to main
- [x] 4.5 Configure Secret Manager for GitHub App private key
- [x] 4.6 Set up Cloud Run health check pointing to `/health` endpoint
- [x] 4.7 Configure custom domain (optional, can use Cloud Run default URL initially)
- [x] 4.8 End-to-end test: deploy to Cloud Run, connect MCP client, query strategy data

## 5. Documentation and Self-Hosting UX

- [x] 5.1 Update `apps/epf-cli/README.md` with cloud server setup instructions
- [x] 5.2 Create self-hosting quickstart guide (one-command deploy to Cloud Run)
- [x] 5.3 Document environment variables for cloud mode
- [x] 5.4 Document GitHub App installation process for repo owners
- [x] 5.5 Add example MCP client configuration for connecting to cloud server
- [x] 5.6 Verify end-to-end self-hosting flow matches fd-016 scn-002 acceptance criteria

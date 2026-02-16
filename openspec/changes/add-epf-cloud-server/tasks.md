## 1. RepositoryProvider Abstraction

- [ ] 1.1 Create `internal/source/source.go` — define `Source` interface (ReadFile, ReadDir, Walk, Stat)
- [ ] 1.2 Create `internal/source/filesystem.go` — implement `FileSystemSource` wrapping os/filepath
- [ ] 1.3 Create `internal/source/github.go` — implement `GitHubSource` using GitHub Contents API
- [ ] 1.4 Create `internal/source/github_fs.go` — implement `fs.FS` adapter for GitHub API responses
- [ ] 1.5 Create `internal/source/cache.go` — implement in-memory cache with TTL and Singleflight
- [ ] 1.6 Refactor existing MCP handlers to accept `Source` interface instead of direct filesystem calls
- [ ] 1.7 Write unit tests for FileSystemSource, GitHubSource (with mock HTTP), and cache
- [ ] 1.8 Verify all existing tests pass with FileSystemSource (no behavior change)

## 2. HTTP/SSE Transport

- [ ] 2.1 Add `--http` flag and `--port` flag to `serve` command
- [ ] 2.2 Implement SSE transport handler in `internal/transport/sse.go`
- [ ] 2.3 Add CORS middleware with configurable allowed origins
- [ ] 2.4 Add `/health` endpoint returning server status and loaded instance info
- [ ] 2.5 Wire up MCP protocol over SSE (request/response + notifications)
- [ ] 2.6 Write integration tests for SSE transport with a test MCP client
- [ ] 2.7 Verify stdio transport still works unchanged

## 3. GitHub App Authentication

- [ ] 3.1 Create EPF GitHub App in emergent-company org settings
- [ ] 3.2 Create `internal/auth/githubapp.go` — JWT signing and installation token exchange
- [ ] 3.3 Implement auto-rotation of installation tokens (refresh before expiry)
- [ ] 3.4 Add configuration for App ID and private key path/secret reference
- [ ] 3.5 Wire up `GitHubSource` to use installation tokens from auth package
- [ ] 3.6 Write tests for JWT generation and token exchange (mock GitHub API)

## 4. GCP Cloud Run Deployment

- [ ] 4.1 Create multi-stage Dockerfile (Go build + minimal runtime image)
- [ ] 4.2 Set up GCP Artifact Registry repository for container images
- [ ] 4.3 Configure Cloud Run service (env vars, Secret Manager mounts, scaling limits)
- [ ] 4.4 Create `.github/workflows/deploy.yaml` — build and deploy on push to main
- [ ] 4.5 Configure Secret Manager for GitHub App private key
- [ ] 4.6 Set up Cloud Run health check pointing to `/health` endpoint
- [ ] 4.7 Configure custom domain (optional, can use Cloud Run default URL initially)
- [ ] 4.8 End-to-end test: deploy to Cloud Run, connect MCP client, query strategy data

## 5. Documentation and Configuration

- [ ] 5.1 Update `apps/epf-cli/README.md` with cloud server setup instructions
- [ ] 5.2 Document environment variables for cloud mode
- [ ] 5.3 Document GitHub App installation process for repo owners
- [ ] 5.4 Add example MCP client configuration for connecting to cloud server

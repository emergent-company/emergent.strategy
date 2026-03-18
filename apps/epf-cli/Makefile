# EPF-CLI Makefile
#
# This Makefile provides commands for building and testing epf-cli locally.
# The key feature is the embedded EPF framework artifacts which make
# the CLI self-contained and usable without external dependencies.
#
# PRODUCTION RELEASES are handled by GoReleaser CI:
#   1. Bump VERSION file and commit
#   2. Tag: git tag v$(cat VERSION) && git push --tags
#   3. GitHub Actions (.github/workflows/release.yaml) runs GoReleaser
#   4. Binaries published to GitHub Releases + Homebrew formula pushed
#
# The `build-all` and `release` targets below are for LOCAL development
# and testing only. They are NOT used for production releases.

# Variables
BINARY_NAME=epf-cli
VERSION?=$(shell cat VERSION 2>/dev/null || echo "dev")
GIT_COMMIT?=$(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_DATE?=$(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
CANONICAL_EPF?=$(shell realpath ../../../canonical-epf 2>/dev/null || echo "")
GCP_PROJECT?=outblocks
GCP_REGION?=europe-west1
SERVICE_NAME?=epf-strategy
AR_REPO?=epf
IMAGE_NAME?=epf-server
IMAGE_TAG?=$(VERSION)
IMAGE_URI?=$(GCP_REGION)-docker.pkg.dev/$(GCP_PROJECT)/$(AR_REPO)/$(IMAGE_NAME):$(IMAGE_TAG)
DOCKER_PLATFORM?=linux/amd64
DEPLOY_IMAGE_REF?=$(IMAGE_URI)
RUNTIME_SERVICE_ACCOUNT?=epf-runtime@$(GCP_PROJECT).iam.gserviceaccount.com
DOCKER_PORT?=8080
DOCKER_RUN_ENV_FILE?=
SERVICE_DOMAIN?=strategy.emergent-company.ai
SERVICE_ENV_VARS?=EPF_SERVER_MODE=strategy,EPF_SERVER_URL=https://$(SERVICE_DOMAIN)
SERVICE_ARGS?=serve,--http,--sse,--port,8080,--cors-origins=*
DEPLOY_SECRETS?=EPF_OAUTH_CLIENT_ID=epf-oauth-client-id:latest,EPF_OAUTH_CLIENT_SECRET=epf-oauth-client-secret:latest,EPF_SESSION_SECRET=epf-session-secret:latest,EPF_GITHUB_APP_ID=epf-github-app-id:latest,EPF_GITHUB_APP_PRIVATE_KEY=epf-github-app-private-key:latest
OPTIONAL_DEPLOY_SECRETS?=EPF_GITHUB_APP_CLIENT_ID=epf-github-app-client-id EPF_GITHUB_APP_CLIENT_SECRET=epf-github-app-client-secret

# Build flags — inject into internal/version package (single source of truth)
VERSION_PKG=github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/version
LDFLAGS=-ldflags "-X $(VERSION_PKG).Version=$(VERSION) \
                  -X $(VERSION_PKG).GitCommit=$(GIT_COMMIT) \
                  -X $(VERSION_PKG).BuildDate=$(BUILD_DATE)"

# Cross-compilation targets
PLATFORMS=darwin/amd64 darwin/arm64 linux/amd64 linux/arm64 windows/amd64
DIST_DIR=dist

.PHONY: all build clean test sync-embedded help build-all release clean-dist dist-local check-version docker-build docker-run docker-push-gcp deploy-manual deploy-check

# Default target
all: build

# Sync embedded artifacts from canonical EPF, then build
build: sync-embedded
	@echo "Building $(BINARY_NAME) $(VERSION)..."
	go build $(LDFLAGS) -o $(BINARY_NAME) .
	@echo "Built $(BINARY_NAME)"
	@./$(BINARY_NAME) version

# Build without syncing embedded (use existing)
build-quick:
	@echo "Building $(BINARY_NAME) $(VERSION) (quick, no sync)..."
	go build $(LDFLAGS) -o $(BINARY_NAME) .
	@echo "Built $(BINARY_NAME)"

# Build darwin/arm64 into dist/ for local distribution
dist-local:
	@echo "Building $(BINARY_NAME) $(VERSION) for local distribution (darwin/arm64)..."
	@mkdir -p $(DIST_DIR)
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o $(DIST_DIR)/$(BINARY_NAME)-darwin-arm64 .
	@echo "Built $(DIST_DIR)/$(BINARY_NAME)-darwin-arm64"
	@$(DIST_DIR)/$(BINARY_NAME)-darwin-arm64 version

# Sync embedded artifacts from canonical EPF
sync-embedded:
	@echo "Syncing embedded artifacts..."
	@if [ -z "$(CANONICAL_EPF)" ]; then \
		echo "Error: CANONICAL_EPF not set and canonical-epf not found at expected location"; \
		echo "Set CANONICAL_EPF=/path/to/canonical-epf or clone it to ../../../canonical-epf"; \
		exit 1; \
	fi
	@./scripts/sync-embedded.sh "$(CANONICAL_EPF)"

# Clean build artifacts
clean:
	@echo "Cleaning..."
	rm -f $(BINARY_NAME)
	rm -rf internal/embedded/schemas
	rm -rf internal/embedded/templates
	rm -rf internal/embedded/wizards
	rm -rf internal/embedded/outputs
	rm -f internal/embedded/VERSION
	rm -f internal/embedded/MANIFEST.txt
	@echo "Cleaned"

# Run tests
test:
	@echo "Running tests..."
	go test -v ./...

# Run tests with coverage
test-coverage:
	@echo "Running tests with coverage..."
	go test -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: coverage.html"

docker-build:
	@echo "Building Docker image $(IMAGE_URI)..."
	@TOKEN="$${EPF_CANONICAL_TOKEN:-$${GITHUB_TOKEN:-}}"; \
	if [ -z "$$TOKEN" ]; then \
		echo "Error: set EPF_CANONICAL_TOKEN or GITHUB_TOKEN for Docker build access"; \
		exit 1; \
	fi; \
	BUILD_GH_TOKEN="$$TOKEN" docker build \
		--platform $(DOCKER_PLATFORM) \
		-f Dockerfile \
		--secret id=gh_token,env=BUILD_GH_TOKEN \
		--build-arg VERSION=$(VERSION) \
		--build-arg GIT_COMMIT=$(GIT_COMMIT) \
		--build-arg BUILD_DATE=$(BUILD_DATE) \
		-t $(IMAGE_URI) .

docker-run:
	@echo "Running Docker image $(IMAGE_URI) on port $(DOCKER_PORT)..."
	@ENV_FILE_PATH="$(DOCKER_RUN_ENV_FILE)"; \
	if [ -n "$(DOCKER_RUN_ENV_FILE)" ]; then \
		docker run --rm -p $(DOCKER_PORT):8080 --env-file "$$ENV_FILE_PATH" $(IMAGE_URI); \
	else \
		docker run --rm -p $(DOCKER_PORT):8080 $(IMAGE_URI); \
	fi; \
	true

docker-push-gcp:
	@echo "Pushing Docker image $(IMAGE_URI)..."
	gcloud auth configure-docker $(GCP_REGION)-docker.pkg.dev --quiet
	docker push $(IMAGE_URI)

deploy-manual:
	@echo "Deploying $(IMAGE_URI) to Cloud Run service $(SERVICE_NAME)..."
	@IMAGE_REF="$(DEPLOY_IMAGE_REF)"; \
	if [ -z "$$IMAGE_REF" ]; then \
		echo "Error: set DEPLOY_IMAGE_REF to an Artifact Registry image ref or digest"; \
		exit 1; \
	fi; \
	if [[ "$$IMAGE_REF" == *@sha256:* ]]; then \
		RESOLVED_IMAGE_REF="$$IMAGE_REF"; \
	else \
		DIGEST="$$(gcloud artifacts docker images describe "$$IMAGE_REF" --project $(GCP_PROJECT) --format='value(image_summary.digest)')"; \
		if [ -z "$$DIGEST" ]; then \
			echo "Error: could not resolve digest for $$IMAGE_REF"; \
			exit 1; \
		fi; \
		RESOLVED_IMAGE_REF="$${IMAGE_REF%%:*}@$$DIGEST"; \
	fi; \
	SECRET_BINDINGS="$(DEPLOY_SECRETS)"; \
	for OPTIONAL in $(OPTIONAL_DEPLOY_SECRETS); do \
		ENV_NAME="$${OPTIONAL%%=*}"; \
		SECRET_NAME="$${OPTIONAL#*=}"; \
		SECRET_VERSION="$$(gcloud secrets versions list "$$SECRET_NAME" --project $(GCP_PROJECT) --filter='state=enabled' --limit=1 --format='value(name)' 2>/dev/null || true)"; \
		if [ -n "$$SECRET_VERSION" ]; then \
			SECRET_BINDINGS="$$SECRET_BINDINGS,$$ENV_NAME=$$SECRET_NAME:latest"; \
		fi; \
	done; \
	echo "Using image $$RESOLVED_IMAGE_REF"; \
	gcloud run deploy $(SERVICE_NAME) \
		--image "$$RESOLVED_IMAGE_REF" \
		--region $(GCP_REGION) \
		--project $(GCP_PROJECT) \
		--platform managed \
		--allow-unauthenticated \
		--service-account $(RUNTIME_SERVICE_ACCOUNT) \
		--port 8080 \
		--min-instances 0 \
		--max-instances 10 \
		--memory 512Mi \
		--cpu 1 \
		--timeout 300 \
		--set-env-vars $(SERVICE_ENV_VARS) \
		--set-secrets "$$SECRET_BINDINGS" \
		--args "$(SERVICE_ARGS)" \
		--cpu-boost \
		--execution-environment gen2

deploy-check:
	@echo "Checking Cloud Run health for $(SERVICE_NAME)..."
	@SERVICE_URL="$$(gcloud run services describe $(SERVICE_NAME) --region $(GCP_REGION) --project $(GCP_PROJECT) --format='value(status.url)')"; \
	if [ -z "$$SERVICE_URL" ]; then \
		echo "Error: could not resolve service URL"; \
		exit 1; \
	fi; \
	echo "Service URL: $$SERVICE_URL"; \
	curl --fail --silent --show-error "$$SERVICE_URL/health"; \
	if gcloud beta run domain-mappings describe $(SERVICE_DOMAIN) --region $(GCP_REGION) --project $(GCP_PROJECT) >/dev/null 2>&1; then \
		echo "Public URL: https://$(SERVICE_DOMAIN)"; \
		curl --fail --silent --show-error "https://$(SERVICE_DOMAIN)/health"; \
	else \
		echo "Skipping custom-domain health check; domain mapping is not configured yet."; \
	fi; \
	echo ""; \
	echo "Health check passed"

# Install to GOPATH/bin
install: build
	@echo "Installing $(BINARY_NAME)..."
	go install $(LDFLAGS) .
	@echo "Installed to $(shell go env GOPATH)/bin/$(BINARY_NAME)"

# Development: build and copy to /usr/local/bin (requires sudo)
install-local: build
	@echo "Installing $(BINARY_NAME) to /usr/local/bin..."
	sudo cp $(BINARY_NAME) /usr/local/bin/
	@echo "Installed to /usr/local/bin/$(BINARY_NAME)"

# Show version info
version:
	@./$(BINARY_NAME) version 2>/dev/null || echo "Run 'make build' first"

# Check if version needs bumping
check-version:
	@./scripts/check-version.sh

# Check embedded artifacts status
check-embedded:
	@echo "Embedded artifacts status:"
	@if [ -d "internal/embedded/schemas" ]; then \
		echo "  schemas:    $(shell ls internal/embedded/schemas/*.json 2>/dev/null | wc -l | tr -d ' ') files"; \
	else \
		echo "  schemas:    NOT SYNCED"; \
	fi
	@if [ -d "internal/embedded/wizards" ]; then \
		echo "  wizards:    $(shell ls internal/embedded/wizards/*.md 2>/dev/null | wc -l | tr -d ' ') files"; \
	else \
		echo "  wizards:    NOT SYNCED"; \
	fi
	@if [ -d "internal/embedded/outputs" ]; then \
		echo "  generators: $(shell ls -d internal/embedded/outputs/*/ 2>/dev/null | wc -l | tr -d ' ') directories"; \
	else \
		echo "  generators: NOT SYNCED"; \
	fi
	@if [ -f "internal/embedded/VERSION" ]; then \
		echo "  version:    $(shell cat internal/embedded/VERSION)"; \
	else \
		echo "  version:    NOT SET"; \
	fi

# Help
help:
	@echo "EPF-CLI Makefile"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Production releases:"
	@echo "  Production builds use GoReleaser CI (not this Makefile)."
	@echo "  To release: bump VERSION, commit, then: git tag v\$$(cat VERSION) && git push --tags"
	@echo "  See .github/workflows/release.yaml for details."
	@echo ""
	@echo "Local development targets:"
	@echo "  build          - Sync embedded artifacts and build the binary (default)"
	@echo "  build-quick    - Build without syncing embedded artifacts"
	@echo "  dist-local     - Build darwin/arm64 into dist/ for local distribution"
	@echo "  sync-embedded  - Copy canonical EPF artifacts to internal/embedded/"
	@echo "  clean          - Remove build artifacts and embedded files"
	@echo "  clean-dist     - Remove dist/ directory only"
	@echo "  test           - Run tests"
	@echo "  test-coverage  - Run tests with coverage report"
	@echo "  install        - Install to GOPATH/bin"
	@echo "  install-local  - Install to /usr/local/bin (requires sudo)"
	@echo "  version        - Show version info"
	@echo "  check-version  - Check if VERSION needs bumping (warns of unbumped changes)"
	@echo "  check-embedded - Show status of embedded artifacts"
	@echo "  docker-build   - Build the release container locally"
	@echo "  docker-run     - Run the local container on port 8080"
	@echo "  docker-push-gcp - Push the local image to Artifact Registry"
	@echo "  deploy-manual  - Manually deploy the tagged image to Cloud Run"
	@echo "  deploy-check   - Curl the deployed Cloud Run /health endpoint"
	@echo "  help           - Show this help"
	@echo ""
	@echo "Local-only (dev/testing, NOT for production releases):"
	@echo "  build-all      - Cross-compile for all platforms locally"
	@echo "  release        - Create local dist/ with versioned binaries + checksums"
	@echo ""
	@echo "Environment variables:"
	@echo "  CANONICAL_EPF  - Path to canonical-epf repo (default: ../../../canonical-epf)"
	@echo "  VERSION        - Version string (default: read from VERSION file)"
	@echo "  EPF_CANONICAL_TOKEN or GITHUB_TOKEN - Required for docker-build"
	@echo "  DOCKER_PLATFORM - Local image target platform (default: linux/amd64)"
	@echo "  GCP_PROJECT/GCP_REGION/SERVICE_NAME - Override Cloud Run deploy defaults"

# Build for all platforms (LOCAL DEV ONLY — production releases use GoReleaser CI)
build-all: sync-embedded
	@./scripts/check-version.sh
	@echo "Building $(BINARY_NAME) $(VERSION) for all platforms..."
	@mkdir -p $(DIST_DIR)
	@for platform in $(PLATFORMS); do \
		GOOS=$$(echo $$platform | cut -d'/' -f1); \
		GOARCH=$$(echo $$platform | cut -d'/' -f2); \
		output="$(DIST_DIR)/$(BINARY_NAME)-$$GOOS-$$GOARCH"; \
		if [ "$$GOOS" = "windows" ]; then output="$$output.exe"; fi; \
		echo "  Building $$GOOS/$$GOARCH..."; \
		GOOS=$$GOOS GOARCH=$$GOARCH go build $(LDFLAGS) -o $$output . || exit 1; \
	done
	@echo "Built binaries in $(DIST_DIR)/"
	@ls -la $(DIST_DIR)/

# Create release with checksums (LOCAL DEV ONLY — production releases use GoReleaser CI)
release: clean-dist
	@./scripts/check-version.sh --strict
	@$(MAKE) build-all
	@echo "Creating release $(VERSION)..."
	@cd $(DIST_DIR) && sha256sum * > checksums.txt 2>/dev/null || shasum -a 256 * > checksums.txt
	@echo "Release $(VERSION) created in $(DIST_DIR)/"
	@echo ""
	@cat $(DIST_DIR)/checksums.txt

# Clean dist directory
clean-dist:
	@echo "Cleaning dist/..."
	@rm -rf $(DIST_DIR)
	@echo "Cleaned dist/"

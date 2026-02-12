# EPF-CLI Makefile
#
# This Makefile provides commands for building and testing epf-cli.
# The key feature is the embedded EPF framework artifacts which make
# the CLI self-contained and usable without external dependencies.

# Variables
BINARY_NAME=epf-cli
VERSION?=$(shell cat VERSION 2>/dev/null || echo "dev")
GIT_COMMIT?=$(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_DATE?=$(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
CANONICAL_EPF?=$(shell realpath ../../../canonical-epf 2>/dev/null || echo "")

# Build flags — inject into internal/version package (single source of truth)
VERSION_PKG=github.com/eyedea-io/emergent/apps/epf-cli/internal/version
LDFLAGS=-ldflags "-X $(VERSION_PKG).Version=$(VERSION) \
                  -X $(VERSION_PKG).GitCommit=$(GIT_COMMIT) \
                  -X $(VERSION_PKG).BuildDate=$(BUILD_DATE)"

# Cross-compilation targets
PLATFORMS=darwin/amd64 darwin/arm64 linux/amd64 linux/arm64 windows/amd64
DIST_DIR=dist

.PHONY: all build clean test sync-embedded help build-all release clean-dist dist-local check-version

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
	@echo "Targets:"
	@echo "  build          - Sync embedded artifacts and build the binary (default)"
	@echo "  build-quick    - Build without syncing embedded artifacts"
	@echo "  dist-local     - Build darwin/arm64 into dist/ for local distribution"
	@echo "  build-all      - Build for all platforms (darwin, linux, windows)"
	@echo "  release        - Create dist/ with versioned release binaries"
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
	@echo "  help           - Show this help"
	@echo ""
	@echo "Environment variables:"
	@echo "  CANONICAL_EPF  - Path to canonical-epf repo (default: ../../../canonical-epf)"
	@echo "  VERSION        - Version string (default: read from VERSION file)"

# Build for all platforms
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

# Create release with checksums
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

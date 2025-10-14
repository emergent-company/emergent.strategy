#!/usr/bin/env bash

# MCP Dev Manager - Installation Script
# This script installs the MCP Dev Manager into a project

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
info() { echo -e "${BLUE}ℹ${NC} $1"; }
success() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; }

# Function to detect project root
detect_project_root() {
    if [ -f "package.json" ]; then
        echo "$(pwd)"
    elif [ -f "../package.json" ]; then
        echo "$(cd .. && pwd)"
    else
        error "Could not find package.json. Please run this script from your project root."
        exit 1
    fi
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to detect script location relative to project root
detect_install_path() {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local project_root="$1"
    
    # Get relative path from project root to script directory
    local rel_path="$(realpath --relative-to="$project_root" "$script_dir" 2>/dev/null || python3 -c "import os.path; print(os.path.relpath('$script_dir', '$project_root'))")"
    
    # Return the relative path (e.g., "mcp-dev-manager" or "tools/mcp-dev-manager")
    echo "$rel_path"
}

# Parse command line arguments
INSTALL_METHOD="submodule"  # Default method
FORCE_REINSTALL=false
SKIP_BUILD=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --method)
            INSTALL_METHOD="$2"
            shift 2
            ;;
        --force)
            FORCE_REINSTALL=true
            shift
            ;;
        --skip-build)
            SKIP_BUILD=true
            shift
            ;;
        --help)
            echo "Usage: ./install.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --method <submodule|clone|link>  Installation method (default: submodule)"
            echo "  --force                           Force reinstall even if already exists"
            echo "  --skip-build                      Skip npm build step"
            echo "  --help                            Show this help message"
            echo ""
            echo "Installation Methods:"
            echo "  submodule - Add as git submodule (recommended for git projects)"
            echo "  clone     - Clone the repo directly (simple, no git integration)"
            echo "  link      - Symlink to existing local repo (for development)"
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            echo "Run './install.sh --help' for usage information"
            exit 1
            ;;
    esac
done

# Main installation
main() {
    echo ""
    info "🚀 MCP Dev Manager Installation"
    echo ""

    # Detect project root
    PROJECT_ROOT=$(detect_project_root)
    info "Project root: $PROJECT_ROOT"
    cd "$PROJECT_ROOT"
    
    # Detect where this script is located relative to project root
    INSTALL_PATH=$(detect_install_path "$PROJECT_ROOT")
    info "Install location: $INSTALL_PATH"

    # Check prerequisites
    info "Checking prerequisites..."
    
    if ! command_exists node; then
        error "Node.js is not installed. Please install Node.js >= 18.0.0"
        exit 1
    fi
    
    if ! command_exists npm; then
        error "npm is not installed. Please install npm"
        exit 1
    fi

    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        error "Node.js version 18 or higher is required (found: $(node -v))"
        exit 1
    fi

    success "Node.js $(node -v) ✓"
    success "npm $(npm -v) ✓"

    # Check if running from an already installed location
    if [ -d "$INSTALL_PATH/dist" ]; then
        info "Detected existing installation at $INSTALL_PATH"
        info "Skipping installation, will update configuration only"
        SKIP_INSTALL=true
    else
        SKIP_INSTALL=false
        
        # Check if already installed at default location
        if [ -d "mcp-dev-manager" ] && [ "$FORCE_REINSTALL" = false ]; then
            warning "mcp-dev-manager already exists in this project"
            read -p "Do you want to reinstall? (y/N) " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                info "Installation cancelled"
                exit 0
            fi
            FORCE_REINSTALL=true
        fi

        # Remove existing installation if force reinstall
        if [ "$FORCE_REINSTALL" = true ] && [ -d "mcp-dev-manager" ]; then
            info "Removing existing installation..."
            rm -rf mcp-dev-manager
            success "Removed existing installation"
        fi
    fi

    # Install based on method (skip if already installed)
    if [ "$SKIP_INSTALL" = false ]; then
        info "Installing using method: $INSTALL_METHOD"
        
        case $INSTALL_METHOD in
            submodule)
                if ! command_exists git; then
                    error "git is not installed. Please install git or use --method clone"
                    exit 1
                fi
                
                if [ ! -d ".git" ]; then
                    error "Not a git repository. Use --method clone instead"
                    exit 1
                fi

                info "Adding git submodule..."
                git submodule add https://github.com/eyedea-io/mcp-dev-manager.git mcp-dev-manager 2>/dev/null || \
                    git submodule update --init --recursive
                success "Git submodule added"
                ;;
                
            clone)
                info "Cloning repository..."
                git clone https://github.com/eyedea-io/mcp-dev-manager.git
                success "Repository cloned"
                ;;
                
            link)
                if [ -z "$MCP_DEV_MANAGER_PATH" ]; then
                    error "MCP_DEV_MANAGER_PATH environment variable not set"
                    error "Please set it to your local mcp-dev-manager repo path"
                    error "Example: export MCP_DEV_MANAGER_PATH=/path/to/mcp-dev-manager"
                    exit 1
                fi
                
                if [ ! -d "$MCP_DEV_MANAGER_PATH" ]; then
                    error "MCP_DEV_MANAGER_PATH directory does not exist: $MCP_DEV_MANAGER_PATH"
                    exit 1
                fi
                
                info "Creating symlink..."
                ln -s "$MCP_DEV_MANAGER_PATH" mcp-dev-manager
                success "Symlink created"
                ;;
                
            *)
                error "Unknown installation method: $INSTALL_METHOD"
                exit 1
                ;;
        esac

        # Build the project
        if [ "$SKIP_BUILD" = false ]; then
            info "Building MCP Dev Manager..."
            cd "$INSTALL_PATH"
            npm install --silent
            npm run build --silent
            cd "$PROJECT_ROOT"
            success "Build completed"
        else
            warning "Skipped build step (--skip-build flag)"
        fi
    fi

    # Create .vscode directory if it doesn't exist
    if [ ! -d ".vscode" ]; then
        info "Creating .vscode directory..."
        mkdir -p .vscode
        success "Created .vscode directory"
    fi

    # Update or create mcp.json
    MCP_JSON_PATH=".vscode/mcp.json"
    info "Configuring MCP settings..."

    if [ -f "$MCP_JSON_PATH" ]; then
        # Check if dev-manager already exists
        if grep -q '"dev-manager"' "$MCP_JSON_PATH"; then
            warning "dev-manager already configured in mcp.json"
            read -p "Do you want to update the configuration? (y/N) " -n 1 -r
            echo
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                info "Please manually update .vscode/mcp.json with the following configuration:"
                echo ""
                cat << EOF
{
  "servers": {
    "dev-manager": {
      "command": "node",
      "args": [
        "$INSTALL_PATH/dist/index.js"
      ],
      "env": {
        "PROJECT_ROOT": "$PROJECT_ROOT"
      }
    }
  }
}
EOF
                echo ""
            fi
        else
            warning "mcp.json exists but dev-manager not found"
            info "Please manually add dev-manager configuration to .vscode/mcp.json"
            echo ""
            cat << EOF
Add this to your "servers" section:

"dev-manager": {
  "command": "node",
  "args": [
    "$INSTALL_PATH/dist/index.js"
  ],
  "env": {
    "PROJECT_ROOT": "$PROJECT_ROOT"
  }
}
EOF
            echo ""
        fi
    else
        info "Creating mcp.json..."
        cat > "$MCP_JSON_PATH" << EOF
{
  "servers": {
    "dev-manager": {
      "command": "node",
      "args": [
        "$INSTALL_PATH/dist/index.js"
      ],
      "env": {
        "PROJECT_ROOT": "$PROJECT_ROOT"
      }
    }
  }
}
EOF
        success "Created .vscode/mcp.json"
    fi

    # Create .github/instructions directory if it doesn't exist
    if [ ! -d ".github/instructions" ]; then
        info "Creating .github/instructions directory..."
        mkdir -p .github/instructions
        success "Created .github/instructions directory"
    fi

    # Copy instructions file
    INSTRUCTIONS_PATH=".github/instructions/mcp-dev-manager.instructions.md"
    if [ -f "$INSTRUCTIONS_PATH" ]; then
        read -p "Instructions file already exists. Overwrite? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cp "$INSTALL_PATH/docs/mcp-dev-manager.instructions.md" "$INSTRUCTIONS_PATH"
            success "Updated instructions file"
        else
            info "Kept existing instructions file"
        fi
    else
        cp "$INSTALL_PATH/docs/mcp-dev-manager.instructions.md" "$INSTRUCTIONS_PATH"
        success "Copied instructions to .github/instructions/"
    fi

    # Create example dev-manager scripts in package.json
    info "Setting up dev-manager scripts..."
    
    if [ -f "package.json" ]; then
        if ! grep -q '"dev-manager:' package.json; then
            warning "No dev-manager scripts found in package.json"
            info "Add scripts like these to your package.json:"
            echo ""
            cat << 'EOF'
"scripts": {
  "dev-manager:build": "npm run build",
  "dev-manager:test": "npm run test",
  "dev-manager:dev": "npm run dev"
}
EOF
            echo ""
            info "See mcp-dev-manager/docs/ for examples"
        else
            success "Found existing dev-manager scripts in package.json"
        fi
    fi

    # Print success message
    echo ""
    success "🎉 Installation complete!"
    echo ""
    info "Next steps:"
    echo "  1. Add 'dev-manager:*' scripts to your package.json"
    echo "  2. Restart VS Code to load the MCP server"
    echo "  3. Use GitHub Copilot to run: '@workspace list available dev-manager scripts'"
    echo ""
    info "Documentation:"
    echo "  • README: mcp-dev-manager/README.md"
    echo "  • Examples: mcp-dev-manager/EXAMPLES.md"
    echo "  • Instructions: .github/instructions/mcp-dev-manager.instructions.md"
    echo ""
    info "To verify installation:"
    echo "  cd mcp-dev-manager && npm test"
    echo ""
}

# Run main function
main "$@"

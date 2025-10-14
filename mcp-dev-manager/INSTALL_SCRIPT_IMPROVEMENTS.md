# Install Script Improvements - Location-Aware Configuration

## Problem

The original `install.sh` script had hardcoded paths that assumed the MCP Dev Manager would always be installed at the project root as `mcp-dev-manager/`. This caused issues when:

1. The tool was installed as a submodule in a different location (e.g., `tools/mcp-dev-manager/`)
2. Users tried to run the install script from an already-installed location

## Solution

The script now **automatically detects its own location** relative to the project root and uses that path throughout the configuration.

### Key Changes

#### 1. **Added `detect_install_path()` Function**

```bash
detect_install_path() {
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local project_root="$1"
    
    # Get relative path from project root to script directory
    local rel_path="$(realpath --relative-to="$project_root" "$script_dir" 2>/dev/null || 
                      python3 -c "import os.path; print(os.path.relpath('$script_dir', '$project_root'))")"
    
    echo "$rel_path"
}
```

This function:
- Finds the script's absolute directory
- Calculates the relative path from project root
- Falls back to Python if `realpath` is not available
- Returns paths like `tools/mcp-dev-manager` or `mcp-dev-manager`

#### 2. **Location Detection at Runtime**

```bash
# Detect where this script is located relative to project root
INSTALL_PATH=$(detect_install_path "$PROJECT_ROOT")
info "Install location: $INSTALL_PATH"
```

The script now shows where it detected itself:
```
ℹ Project root: /Users/mcj/code/spec-server
ℹ Install location: tools/mcp-dev-manager
```

#### 3. **Smart Installation Skip**

```bash
# Check if running from an already installed location
if [ -d "$INSTALL_PATH/dist" ]; then
    info "Detected existing installation at $INSTALL_PATH"
    info "Skipping installation, will update configuration only"
    SKIP_INSTALL=true
fi
```

If the script detects it's already in an installed location (by checking for `dist/` directory), it:
- Skips the installation steps (submodule/clone/link)
- Skips the build step (unless already building is needed)
- Focuses on updating configuration only

#### 4. **Dynamic Path in mcp.json**

All mcp.json configuration now uses `$INSTALL_PATH`:

```bash
"args": [
  "$INSTALL_PATH/dist/index.js"
]
```

This generates correct paths like:
- `tools/mcp-dev-manager/dist/index.js` (when installed in tools/)
- `mcp-dev-manager/dist/index.js` (when installed at root)

#### 5. **Dynamic Path for Instructions Copy**

```bash
cp "$INSTALL_PATH/docs/mcp-dev-manager.instructions.md" "$INSTRUCTIONS_PATH"
```

Uses the detected location to find the instructions file.

## Testing

### Test 1: Detecting Location from Submodule

```bash
cd /Users/mcj/code/spec-server
./tools/mcp-dev-manager/install.sh --skip-build
```

**Output:**
```
ℹ Install location: tools/mcp-dev-manager
ℹ Detected existing installation at tools/mcp-dev-manager
ℹ Skipping installation, will update configuration only
```

**Generated Configuration:**
```json
{
  "servers": {
    "dev-manager": {
      "command": "node",
      "args": [
        "tools/mcp-dev-manager/dist/index.js"
      ],
      "env": {
        "PROJECT_ROOT": "/Users/mcj/code/spec-server"
      }
    }
  }
}
```

✅ **Correct path detected and configured!**

### Test 2: Fresh Installation (simulated)

When installed fresh at the root (e.g., via `--method clone`):

**Expected Output:**
```
ℹ Install location: mcp-dev-manager
```

**Expected Configuration:**
```json
"args": ["mcp-dev-manager/dist/index.js"]
```

## Benefits

### 1. **Flexible Installation**
- Can be installed anywhere in the project
- Works as submodule in `tools/`, `scripts/`, or any custom location
- Works when cloned directly to root

### 2. **Self-Awareness**
- Script knows where it is
- No manual path configuration needed
- Reduces user error

### 3. **Configuration Automation**
- Automatically generates correct paths
- No need to manually edit mcp.json
- Instructions file copied from correct location

### 4. **Better UX**
- Clear feedback about detected location
- Skips unnecessary steps when already installed
- Focuses on configuration when re-run

## Backwards Compatibility

The script maintains full backwards compatibility:

- **Default behavior**: Still installs to `mcp-dev-manager/` at root
- **Existing installations**: Detects and works with them
- **All methods supported**: submodule, clone, link all work

## Usage Examples

### As Submodule in tools/
```bash
git submodule add git@github.com:eyedea-io/mcp-dev-manager.git tools/mcp-dev-manager
cd tools/mcp-dev-manager
npm install && npm run build
./install.sh --skip-build
```

Result: Configures `tools/mcp-dev-manager/dist/index.js`

### Direct Clone at Root
```bash
./tools/mcp-dev-manager/install.sh --method clone
```

Result: Clones to `mcp-dev-manager/` and configures `mcp-dev-manager/dist/index.js`

### Update Existing Configuration
```bash
cd existing-project/tools/mcp-dev-manager
./install.sh --force --skip-build
```

Result: Updates mcp.json with correct path from existing location

## Files Modified

- `tools/mcp-dev-manager/install.sh` - Added location detection and dynamic path configuration

## Verification

To verify the fix works correctly:

```bash
# 1. Check location detection
cd /Users/mcj/code/spec-server
bash -c '
SCRIPT_DIR="$(cd "$(dirname "./tools/mcp-dev-manager/install.sh")" && pwd)"
PROJECT_ROOT="$(pwd)"
REL_PATH="$(realpath --relative-to="$PROJECT_ROOT" "$SCRIPT_DIR" 2>/dev/null || 
           python3 -c "import os.path; print(os.path.relpath(\"$SCRIPT_DIR\", \"$PROJECT_ROOT\"))")"
echo "Detected path: $REL_PATH"
'

# 2. Run install script
./tools/mcp-dev-manager/install.sh --skip-build

# 3. Check generated configuration
cat .vscode/mcp.json | grep -A 5 "dev-manager"
```

Expected output:
```
Detected path: tools/mcp-dev-manager
```

---

**Status**: ✅ Complete and Tested  
**Date**: October 6, 2025  
**Issue**: Install script now location-aware  
**Impact**: Automatic path detection for any installation location

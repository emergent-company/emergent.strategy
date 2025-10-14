# MCP Dev Manager - Repository Setup Guide

This guide explains how to prepare the MCP Dev Manager for use as a standalone repository that can be integrated into other projects.

## 📦 Repository Structure

```
mcp-dev-manager/
├── src/                      # TypeScript source code
│   ├── index.ts             # Main MCP server
│   ├── tools/               # MCP tool implementations
│   │   ├── run-script.ts    # Script execution tool
│   │   ├── browse-logs.ts   # Log management tool
│   │   ├── check-status.ts  # Service monitoring tool
│   │   ├── run-tests.ts     # Legacy test runner
│   │   └── manage-service.ts # Legacy service manager
│   └── utils/               # Shared utilities
├── docs/                     # Documentation
│   ├── mcp-dev-manager.instructions.md  # AI assistant instructions
│   └── ...
├── dist/                     # Compiled JavaScript (generated)
├── install.sh               # Installation script
├── package.json
├── tsconfig.json
├── README.md
├── SETUP.md                 # This file
├── EXAMPLES.md
├── CHANGELOG.md
└── LICENSE
```

## 🚀 Creating a Standalone Repository

### Step 1: Extract to Separate Repo

If currently embedded in another project:

```bash
# Create new repo directory
mkdir mcp-dev-manager-repo
cd mcp-dev-manager-repo

# Initialize git
git init

# Copy files (from parent project)
cp -r ../spec-server/mcp-dev-manager/* .

# Commit
git add .
git commit -m "Initial commit: MCP Dev Manager standalone"

# Add remote and push
git remote add origin https://github.com/eyedea-io/mcp-dev-manager.git
git push -u origin main
```

### Step 2: Clean Up Dependencies

Review `package.json` to ensure:
- No parent project dependencies
- All required packages are listed
- Version numbers are correct

```bash
cd mcp-dev-manager-repo
npm install
npm run build
```

### Step 3: Test Standalone

```bash
# Set test environment
export PROJECT_ROOT=/path/to/test/project

# Run the server
node dist/index.js

# Or use inspector
npm run inspector
```

## 🔧 Integration Methods

### Method 1: Git Submodule (Recommended)

**When to use:**
- You want to track a specific version
- You want to receive updates easily
- Your project is already using git

**Setup:**
```bash
cd your-project
git submodule add https://github.com/eyedea-io/mcp-dev-manager.git
cd mcp-dev-manager
npm install
npm run build
```

**Update:**
```bash
cd mcp-dev-manager
git pull origin main
npm install
npm run build
```

**Pros:**
- Easy to update
- Version tracking
- Minimal overhead

**Cons:**
- Requires git knowledge
- Submodule complexity

### Method 2: Direct Clone

**When to use:**
- Simple projects
- You don't need updates
- You want to modify the code

**Setup:**
```bash
cd your-project
git clone https://github.com/eyedea-io/mcp-dev-manager.git
cd mcp-dev-manager
npm install
npm run build
```

**Update:**
```bash
cd mcp-dev-manager
git pull
npm install
npm run build
```

**Pros:**
- Simple
- Modifiable
- No submodule complexity

**Cons:**
- Manual updates
- Not tracked in parent repo

### Method 3: npm Package (Future)

**When to use:**
- Production projects
- Easy version management
- Standard npm workflow

**Setup:**
```bash
npm install -D @eyedea/mcp-dev-manager
```

**Pros:**
- Standard npm workflow
- Version management
- Easy updates

**Cons:**
- Requires npm publishing
- Less flexible for modifications

### Method 4: Symlink (Development)

**When to use:**
- Developing mcp-dev-manager itself
- Testing changes across projects
- Multiple projects using same instance

**Setup:**
```bash
# In development location
cd ~/dev/mcp-dev-manager
npm install
npm run build

# In your project
cd ~/projects/my-app
ln -s ~/dev/mcp-dev-manager mcp-dev-manager
```

**Pros:**
- Instant changes across projects
- Perfect for development

**Cons:**
- Not portable
- Requires local mcp-dev-manager repo

## 📝 Configuration Files

### .vscode/mcp.json

Create or update:

```json
{
  "servers": {
    "dev-manager": {
      "command": "node",
      "args": ["mcp-dev-manager/dist/index.js"],
      "env": {
        "PROJECT_ROOT": "/absolute/path/to/your/project",
        "NODE_ENV": "development"
      }
    }
  }
}
```

**Important:**
- `PROJECT_ROOT` must be absolute path
- Use your actual project path
- Can add custom env vars

### .github/instructions/mcp-dev-manager.instructions.md

Copy from mcp-dev-manager:

```bash
mkdir -p .github/instructions
cp mcp-dev-manager/docs/mcp-dev-manager.instructions.md .github/instructions/
```

This file guides AI assistants on how to use the tools.

### package.json Scripts

Add dev-manager scripts:

```json
{
  "scripts": {
    "dev-manager:build": "npm run build",
    "dev-manager:test": "npm run test",
    "dev-manager:test:e2e": "npm run test:e2e",
    "dev-manager:dev": "npm run dev",
    "dev-manager:docker:up": "cd docker && docker compose up -d",
    "dev-manager:docker:down": "cd docker && docker compose down",
    "dev-manager:docker:ps": "cd docker && docker compose ps",
    "dev-manager:docker:logs": "cd docker && docker compose logs --tail=100"
  }
}
```

**Naming Convention:**
- Prefix: `dev-manager:`
- Pattern: `dev-manager:{app}:{action}`
- Examples:
  - `dev-manager:admin:build`
  - `dev-manager:server:test`
  - `dev-manager:docker:up`

## 🧪 Testing Integration

### 1. Check Installation

```bash
# Verify files exist
ls -la mcp-dev-manager/dist/index.js

# Check build
cd mcp-dev-manager
npm run build
cd ..
```

### 2. Test MCP Connection

In VS Code with GitHub Copilot:

```
@workspace list available dev-manager scripts
@workspace check service status
```

Should return formatted lists without errors.

### 3. Run a Script

```
@workspace run dev-manager:build
```

Should execute and show output.

### 4. Browse Logs

```
@workspace list all log files
@workspace show last 20 lines of errors.log
```

Should show log contents.

## 🔄 Update Workflow

### For Submodule Users

```bash
# Update to latest
cd mcp-dev-manager
git pull origin main
npm install
npm run build
cd ..

# Commit the update
git add mcp-dev-manager
git commit -m "Update mcp-dev-manager to latest"
```

### For Direct Clone Users

```bash
cd mcp-dev-manager
git pull
npm install
npm run build
cd ..
```

## 📦 Distribution Checklist

Before publishing or sharing:

- [ ] All source code in `src/`
- [ ] Build script works (`npm run build`)
- [ ] No hardcoded paths or secrets
- [ ] README.md is complete
- [ ] EXAMPLES.md has real examples
- [ ] CHANGELOG.md is updated
- [ ] LICENSE file exists
- [ ] package.json is clean
- [ ] install.sh is executable
- [ ] Documentation in `docs/`
- [ ] Test on fresh clone

## 🐛 Troubleshooting

### Build Fails

```bash
cd mcp-dev-manager
rm -rf node_modules dist
npm install
npm run build
```

### MCP Not Loading

1. Check `.vscode/mcp.json` syntax
2. Verify `PROJECT_ROOT` is absolute path
3. Restart VS Code
4. Check Copilot console for errors

### Scripts Not Found

1. Check `package.json` has `dev-manager:` scripts
2. Run `@workspace list available dev-manager scripts`
3. Verify script names match pattern

### Permission Errors

```bash
chmod +x mcp-dev-manager/install.sh
chmod +x mcp-dev-manager/dist/index.js
```

## 📚 Additional Resources

- [MCP Protocol Docs](https://modelcontextprotocol.io/)
- [GitHub Copilot Docs](https://docs.github.com/copilot)
- [Examples Directory](./examples/)
- [API Documentation](./docs/API.md)

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and contribution guidelines.

## 📄 License

MIT - See [LICENSE](./LICENSE) for details.

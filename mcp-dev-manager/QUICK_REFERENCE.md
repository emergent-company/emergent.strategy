# MCP Dev Manager - Quick Reference

## 🚀 Installation (Pick One)

### Automated
```bash
curl -fsSL https://raw.githubusercontent.com/eyedea-io/mcp-dev-manager/main/install.sh | bash
```

### Git Submodule
```bash
git submodule add https://github.com/eyedea-io/mcp-dev-manager.git
cd mcp-dev-manager && npm install && npm run build
```

### Direct Clone
```bash
git clone https://github.com/eyedea-io/mcp-dev-manager.git
cd mcp-dev-manager && npm install && npm run build
```

## ⚙️ Configuration

### .vscode/mcp.json
```json
{
  "servers": {
    "dev-manager": {
      "command": "node",
      "args": ["mcp-dev-manager/dist/index.js"],
      "env": {
        "PROJECT_ROOT": "/absolute/path/to/project"
      }
    }
  }
}
```

### package.json Scripts
```json
{
  "scripts": {
    "dev-manager:build": "npm run build",
    "dev-manager:test": "npm run test",
    "dev-manager:dev": "npm run dev",
    "dev-manager:docker:up": "docker compose up -d"
  }
}
```

### .github/instructions/
```bash
mkdir -p .github/instructions
cp mcp-dev-manager/docs/mcp-dev-manager.instructions.md .github/instructions/
```

## 💬 Usage with GitHub Copilot

### Discover Scripts
```
@workspace list available dev-manager scripts
```

### Run Scripts
```
@workspace run the build
@workspace run e2e tests
@workspace start docker services
```

### Check Status
```
@workspace check service status
@workspace what ports are in use
@workspace is docker running
```

### Browse Logs
```
@workspace list all log files
@workspace show last 50 lines of errors.log
@workspace search for ERROR in logs
```

## 🛠️ MCP Tools

### run_script
```typescript
mcp_dev-manager_run_script({
  app: "admin",
  action: "build"
})
```

### list_scripts
```typescript
mcp_dev-manager_list_scripts()
```

### check_status
```typescript
mcp_dev-manager_check_status({
  services: ["docker-compose", "ports"]
})
```

### browse_logs
```typescript
mcp_dev-manager_browse_logs({
  action: "tail",
  logFile: "logs/errors.log",
  lines: 50
})
```

## 📝 Script Naming Convention

Pattern: `dev-manager:{app}:{action}`

Examples:
- `dev-manager:admin:build`
- `dev-manager:server:test`
- `dev-manager:docker:up`

## 🔄 Updates

### Submodule
```bash
cd mcp-dev-manager
git pull origin main
npm install && npm run build
```

### Clone
```bash
cd mcp-dev-manager
git pull
npm install && npm run build
```

## 🐛 Troubleshooting

### MCP Not Loading
1. Check `.vscode/mcp.json` syntax
2. Verify `PROJECT_ROOT` is absolute path
3. Restart VS Code

### Build Fails
```bash
cd mcp-dev-manager
rm -rf node_modules dist
npm install && npm run build
```

### Scripts Not Found
1. Check `package.json` has `dev-manager:` prefix
2. Run `list_scripts` to see available scripts

## 📚 Documentation

- [README.md](../mcp-dev-manager/README.md) - Complete guide
- [REPO_SETUP.md](../mcp-dev-manager/REPO_SETUP.md) - Setup instructions
- [EXAMPLES.md](../mcp-dev-manager/EXAMPLES.md) - Usage examples

## 🔗 Links

- **GitHub**: https://github.com/eyedea-io/mcp-dev-manager
- **Issues**: https://github.com/eyedea-io/mcp-dev-manager/issues
- **Email**: support@eyedea.io

# Implementation Tasks

## 1. Preparation

- [x] 1.1 Review log file structure in `apps/logs/`
- [x] 1.2 Analyze workspace CLI log configuration
- [x] 1.3 Design query parsing logic for service selection

## 2. Tool Implementation

- [x] 2.1 Create `logs.ts` tool file with TypeScript structure
- [x] 2.2 Implement log file path resolution logic
- [x] 2.3 Add query parser to map natural language to services (all, admin, web, server, api, database, postgres, zitadel)
- [x] 2.4 Implement file reading with tail functionality (last N lines)
- [x] 2.5 Handle both stdout (out.log) and stderr (error.log) files
- [x] 2.6 Add support for dependency logs (postgres, zitadel)
- [x] 2.7 Format output with clear service labels and separators
- [x] 2.8 Handle missing log files gracefully
- [x] 2.9 Add line limit parameter with default of 50 lines

## 3. Testing

- [x] 3.1 Test tool with query "all"
- [x] 3.2 Test tool with query "admin" or "web"
- [x] 3.3 Test tool with query "server" or "api"
- [x] 3.4 Test tool with query "database" or "postgres"
- [x] 3.5 Test tool with combined queries like "admin and server"
- [x] 3.6 Test tool with missing log files
- [x] 3.7 Verify output formatting is readable
- [x] 3.8 Test with different line limits

## 4. Documentation

- [x] 4.1 Add JSDoc comments to tool explaining purpose and usage
- [x] 4.2 Add inline comments for query parsing logic
- [x] 4.3 Update `.opencode/instructions.md` to mention the logs tool
- [x] 4.4 Document query patterns and examples

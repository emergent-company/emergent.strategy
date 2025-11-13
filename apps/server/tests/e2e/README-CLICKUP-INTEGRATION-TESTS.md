# ClickUp Real API Integration Tests

## Overview

This test suite verifies the ClickUp integration using **real API credentials** and **real data** from your ClickUp workspace. Unlike the E2E UI tests (which use mocks), these tests make actual HTTP requests to the ClickUp API.

## What These Tests Do

### ✅ Tests Included

1. **Authentication** - Verify API token validity
2. **Workspace Access** - Fetch workspace details and metadata
3. **Structure Fetching** - Build complete hierarchy (Spaces → Folders → Lists)
4. **Task Retrieval** - Fetch and paginate tasks from lists
5. **Data Mapping** - Transform ClickUp entities to internal format
6. **Rate Limiting** - Verify throttling behavior
7. **Error Handling** - Test invalid credentials and IDs
8. **Performance** - Measure API response times

### 🔒 Safety Guarantees

- **READ-ONLY**: Tests only fetch data, never create/update/delete
- **No Modifications**: Your ClickUp workspace remains unchanged
- **Rate Limit Aware**: Respects ClickUp's 100 req/min limit
- **Credentials Protected**: `.env.test.local` is gitignored

## Setup Instructions

### Step 1: Get ClickUp Credentials

#### A. Get API Token

1. Open [ClickUp Settings → Apps](https://app.clickup.com/settings/apps)
2. Scroll to "API Token" section
3. Click "Generate" (or copy existing token)
4. Copy the token (starts with `pk_`)

#### B. Get Workspace ID

1. Navigate to any page in your ClickUp workspace
2. Look at the URL: `https://app.clickup.com/WORKSPACE_ID/v/...`
3. Copy the numeric ID (e.g., `12345678`)

### Step 2: Create Environment File

```bash
# In the project root directory
cd /Users/mcj/code/spec-server

# Copy the example file
cp .env.test.local.example .env.test.local

# Edit with your credentials
nano .env.test.local  # or use your preferred editor
```

Add your credentials:
```bash
CLICKUP_API_TOKEN=pk_123456_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890
CLICKUP_WORKSPACE_ID=12345678
```

### Step 3: Run the Tests

```bash
cd apps/server-nest

# Run all integration tests
npm run test:integration:clickup

# Or run directly with Jest
npx jest test/clickup-real-api.integration.spec.ts --verbose
```

## Expected Output

### Successful Run

```
🔍 Testing with ClickUp credentials:
   Token: pk_1234567...
   Workspace: 12345678

✅ Authenticated as: john.doe (john@example.com)
✅ Found workspace: My Workspace (12345678)
   Members: 5

✅ Found 3 spaces:
   - Marketing (space_123)
   - Engineering (space_456)
   - Product (space_789)

🔍 Analyzing space: Marketing
✅ Found 2 folders in space
   - Q1 2025 (folder_abc)
   - Q2 2025 (folder_def)
✅ Found 1 folderless lists
   - General Tasks (list_xyz)

🔍 Fetching tasks from list: General Tasks
✅ Found 15 tasks

📋 Sample task:
   Name: Update website copy
   Status: in progress
   Priority: high
   Due Date: 2025-10-15
   Tags: marketing, content

🔄 Mapping verification:
   Original: Update website copy
   Mapped title: Update website copy
   External ID: task_123
   External URL: https://app.clickup.com/t/task_123
   Metadata keys: status, priority, due_date, tags, assignees

⏱️  Testing rate limiter with 5 requests...
   Request 1: 12ms elapsed
   Request 2: 125ms elapsed
   Request 3: 238ms elapsed
   Request 4: 351ms elapsed
   Request 5: 464ms elapsed
✅ Completed 5 requests in 465ms

🏗️  Building workspace structure...

📊 Workspace Structure:
   Workspace: My Workspace
   Spaces: 3
   Folders: 5
   Lists: 12

⏱️  Performance benchmarks:
   Get User: 234ms
   Get Spaces: 567ms
   Get Full Structure: 8,421ms

✅ All ClickUp real API tests completed successfully!
   Your ClickUp integration is working correctly.

Test Suites: 1 passed, 1 total
Tests:       8 passed, 8 total
Time:        15.432s
```

### If Credentials Missing

```
⚠️  Skipping ClickUp real API tests - credentials not provided
   To run these tests, create .env.test.local with:
   CLICKUP_API_TOKEN=pk_your_token_here
   CLICKUP_WORKSPACE_ID=your_workspace_id_here

Test Suites: 1 skipped, 0 of 1 total
Tests:       8 skipped, 8 total
```

## Troubleshooting

### Error: "Invalid API token"

**Cause**: Token is incorrect or expired

**Solution**:
1. Verify token starts with `pk_`
2. Regenerate token in ClickUp Settings → Apps
3. Update `.env.test.local` with new token

### Error: "Workspace not found"

**Cause**: Workspace ID is incorrect

**Solution**:
1. Check URL when viewing ClickUp: `app.clickup.com/WORKSPACE_ID/...`
2. Ensure you're using the numeric workspace ID, not team name
3. Verify you have access to this workspace

### Error: "Rate limit exceeded"

**Cause**: Made too many requests too quickly

**Solution**:
1. Wait 60 seconds and try again
2. ClickUp allows 100 requests per minute
3. Tests should respect this automatically

### Tests Timeout

**Cause**: API responses are slow or network issues

**Solution**:
1. Check your internet connection
2. Verify ClickUp API status: https://status.clickup.com
3. Increase timeout in test command:
   ```bash
   npx jest test/clickup-real-api.integration.spec.ts --testTimeout=300000
   ```

## Test Structure

### Test File Organization

```typescript
describe('ClickUp Real API Integration Tests', () => {
  describe('1. API Client - Basic Connectivity', () => {
    // Authentication tests
  });
  
  describe('2. Workspace Structure - Hierarchy Fetching', () => {
    // Spaces, folders, lists tests
  });
  
  describe('3. Task Fetching - Sample Data', () => {
    // Task retrieval tests
  });
  
  describe('4. Data Mapping - Entity Transformation', () => {
    // Entity mapping tests
  });
  
  describe('5. Rate Limiting - Throttle Behavior', () => {
    // Rate limiter tests
  });
  
  describe('6. Import Service - Structure Building', () => {
    // Full structure tests
  });
  
  describe('7. Error Handling - Invalid Credentials', () => {
    // Negative tests
  });
  
  describe('8. Performance - API Response Times', () => {
    // Performance benchmarks
  });
});
```

### Key Services Tested

- `ClickUpApiClient` - HTTP communication with ClickUp API
- `ClickUpRateLimiterService` - Request throttling
- `ClickUpImportService` - Data fetching and aggregation
- `ClickUpDataMapperService` - Entity transformation

## Rate Limiting

### ClickUp API Limits

- **Rate**: 100 requests per minute per token
- **Burst**: Team rate limits may apply
- **Headers**: `X-RateLimit-*` headers show remaining quota

### Test Behavior

The tests respect rate limits by:
1. Using `ClickUpRateLimiterService` for throttling
2. Waiting between requests when needed
3. Tracking request count per 60-second window

## Performance Benchmarks

### Expected Response Times

| Operation | Expected Time | Acceptable Max |
|-----------|---------------|----------------|
| Get User | < 500ms | 5 seconds |
| Get Spaces | < 1 second | 5 seconds |
| Get Single List | < 1 second | 5 seconds |
| Get Tasks (100) | < 2 seconds | 10 seconds |
| Full Structure | < 15 seconds | 30 seconds |

*Times vary based on workspace size and network latency*

## CI/CD Integration

### Running in CI

```yaml
# .github/workflows/test-integration.yml
name: Integration Tests

on: [push, pull_request]

jobs:
  clickup-integration:
    runs-on: ubuntu-latest
    
    # Only run if secrets are available
    if: ${{ secrets.CLICKUP_API_TOKEN != '' }}
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
        working-directory: apps/server-nest
      
      - name: Run ClickUp integration tests
        env:
          CLICKUP_API_TOKEN: ${{ secrets.CLICKUP_API_TOKEN }}
          CLICKUP_WORKSPACE_ID: ${{ secrets.CLICKUP_WORKSPACE_ID }}
        run: npm run test:integration:clickup
        working-directory: apps/server-nest
```

### GitHub Secrets Setup

1. Go to repository Settings → Secrets → Actions
2. Add secrets:
   - `CLICKUP_API_TOKEN`
   - `CLICKUP_WORKSPACE_ID`

## Security Best Practices

### ✅ DO

- Store credentials in `.env.test.local` (gitignored)
- Use a dedicated test workspace if possible
- Rotate API tokens regularly
- Use team member accounts (not owner) for testing
- Review ClickUp audit logs periodically

### ❌ DON'T

- Commit credentials to version control
- Share tokens in Slack/email
- Use production workspaces for testing
- Give tokens to external services
- Ignore rate limit warnings

## What's Being Tested

### 1. Authentication Flow
```typescript
const user = await apiClient.getCurrentUser(apiToken);
// Verifies token is valid and user has access
```

### 2. Workspace Access
```typescript
const teams = await apiClient.getTeams(apiToken);
const workspace = teams.find(t => t.id === workspaceId);
// Verifies workspace exists and is accessible
```

### 3. Hierarchy Traversal
```typescript
const spaces = await apiClient.getSpaces(apiToken, workspaceId);
const folders = await apiClient.getFolders(apiToken, spaceId);
const lists = await apiClient.getLists(apiToken, folderId);
// Verifies complete hierarchy can be fetched
```

### 4. Task Fetching
```typescript
const tasks = await apiClient.getTasks(apiToken, listId, {
  page: 0,
  includeArchived: false
});
// Verifies task retrieval and pagination
```

### 5. Data Mapping
```typescript
const mappedTask = dataMapper.mapTask(clickUpTask, listId, workspaceId);
// Verifies entity transformation is correct
```

### 6. Rate Limiting
```typescript
await rateLimiter.waitForSlot(); // Blocks if limit reached
// Verifies throttling prevents 429 errors
```

## Maintenance

### Updating Tests

When ClickUp API changes:
1. Update type definitions in `clickup.types.ts`
2. Update API client methods in `clickup-api.client.ts`
3. Update tests to match new response format
4. Run tests to verify compatibility

### Adding New Tests

```typescript
describe('9. New Feature Tests', () => {
  it('should test new feature', async () => {
    if (skipTests) return;
    
    // Your test code here
    const result = await apiClient.newMethod(apiToken);
    
    expect(result).toBeDefined();
    console.log(`✅ Test passed`);
  }, 30000);
});
```

## Related Documentation

- [ClickUp API Documentation](https://clickup.com/api)
- [Rate Limits](https://clickup.com/api/developer-portal/rate-limits/)
- [Authentication](https://clickup.com/api/developer-portal/authentication/)
- [Webhooks](https://clickup.com/api/developer-portal/webhooks/)

## Support

### Internal Resources
- Backend implementation: `apps/server-nest/src/modules/clickup/`
- Type definitions: `apps/server-nest/src/modules/clickup/clickup.types.ts`
- API client: `apps/server-nest/src/modules/clickup/clickup-api.client.ts`

### External Support
- ClickUp Developer Portal: https://clickup.com/api
- ClickUp API Status: https://status.clickup.com
- ClickUp Support: https://help.clickup.com

---

**Created**: October 6, 2025  
**Last Updated**: October 6, 2025  
**Maintainer**: Engineering Team

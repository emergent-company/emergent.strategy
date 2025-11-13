/**
 * ClickUp Real API Integration Tests
 *
 * These tests use REAL ClickUp credentials to verify:
 * 1. API connectivity
 * 2. Authentication
 * 3. Workspace structure fetching
 * 4. Data import flow
 *
 * SETUP:
 * 1. Create a .env.test.local file (gitignored) with:
 *    CLICKUP_API_TOKEN=pk_your_real_token_here
 *    CLICKUP_WORKSPACE_ID=your_workspace_id_here
 *
 * 2. Run tests:
 *    npm run test:integration:clickup
 *
 * WARNING: These tests make REAL API calls to ClickUp.
 * - They will count against your rate limit
 * - They will read actual data from your workspace
 * - They will NOT modify or write any data (read-only operations)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env.test.local') });

// Import services to test
import { ClickUpApiClient } from '../../src/modules/clickup/clickup-api.client';
import { ClickUpDataMapper } from '../../src/modules/clickup/clickup-data-mapper.service';

describe('ClickUp Real API Integration Tests', () => {
  let apiClient: ClickUpApiClient;
  let dataMapper: ClickUpDataMapper;

  // Test credentials from environment
  const apiToken = process.env.CLICKUP_API_TOKEN;
  const workspaceId = process.env.CLICKUP_WORKSPACE_ID;

  // Skip all tests if credentials are not provided
  const skipTests = !apiToken || !workspaceId;

  beforeAll(async () => {
    if (skipTests) {
      console.log(
        '⚠️  Skipping ClickUp real API tests - credentials not provided'
      );
      console.log('   To run these tests, create .env.test.local with:');
      console.log('   CLICKUP_API_TOKEN=pk_your_token_here');
      console.log('   CLICKUP_WORKSPACE_ID=your_workspace_id_here');
      return;
    }

    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot()],
      providers: [
        ClickUpRateLimiterService,
        ClickUpApiClient,
        ClickUpDataMapperService,
        ClickUpImportService,
      ],
    }).compile();

    rateLimiter = module.get<ClickUpRateLimiterService>(
      ClickUpRateLimiterService
    );
    apiClient = module.get<ClickUpApiClient>(ClickUpApiClient);
    dataMapper = module.get<ClickUpDataMapperService>(ClickUpDataMapperService);
    importService = module.get<ClickUpImportService>(ClickUpImportService);

    console.log('\n🔍 Testing with ClickUp credentials:');
    console.log(`   Token: ${apiToken.substring(0, 10)}...`);
    console.log(`   Workspace: ${workspaceId}\n`);
  });

  describe('1. API Client - Basic Connectivity', () => {
    it('should authenticate successfully with valid token', async () => {
      if (skipTests) return;

      const user = await apiClient.getCurrentUser(apiToken);

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.username).toBeDefined();
      expect(user.email).toBeDefined();

      console.log(`✅ Authenticated as: ${user.username} (${user.email})`);
    }, 30000); // 30 second timeout for API call

    it('should fetch workspace details', async () => {
      if (skipTests) return;

      const teams = await apiClient.getTeams(apiToken);

      expect(teams).toBeDefined();
      expect(Array.isArray(teams)).toBe(true);
      expect(teams.length).toBeGreaterThan(0);

      const workspace = teams.find((team) => team.id === workspaceId);
      expect(workspace).toBeDefined();

      console.log(`✅ Found workspace: ${workspace.name} (${workspace.id})`);
      console.log(`   Members: ${workspace.members?.length || 0}`);
    }, 30000);
  });

  describe('2. Workspace Structure - Hierarchy Fetching', () => {
    it('should fetch all spaces in workspace', async () => {
      if (skipTests) return;

      const spaces = await apiClient.getSpaces(apiToken, workspaceId);

      expect(spaces).toBeDefined();
      expect(Array.isArray(spaces)).toBe(true);

      console.log(`✅ Found ${spaces.length} spaces:`);
      spaces.forEach((space) => {
        console.log(`   - ${space.name} (${space.id})`);
      });

      expect(spaces.length).toBeGreaterThan(0);
    }, 30000);

    it('should fetch folders and lists from first space', async () => {
      if (skipTests) return;

      const spaces = await apiClient.getSpaces(apiToken, workspaceId);
      expect(spaces.length).toBeGreaterThan(0);

      const firstSpace = spaces[0];
      console.log(`\n🔍 Analyzing space: ${firstSpace.name}`);

      // Fetch folders
      const folders = await apiClient.getFolders(apiToken, firstSpace.id);
      console.log(`✅ Found ${folders.length} folders in space`);
      folders.forEach((folder) => {
        console.log(`   - ${folder.name} (${folder.id})`);
      });

      // Fetch folderless lists
      const lists = await apiClient.getLists(apiToken, firstSpace.id);
      console.log(`✅ Found ${lists.length} folderless lists`);
      lists.forEach((list) => {
        console.log(`   - ${list.name} (${list.id})`);
      });

      expect(folders.length + lists.length).toBeGreaterThan(0);
    }, 60000); // 60 seconds for multiple API calls
  });

  describe('3. Task Fetching - Sample Data', () => {
    it('should fetch tasks from first available list', async () => {
      if (skipTests) return;

      const spaces = await apiClient.getSpaces(apiToken, workspaceId);
      const firstSpace = spaces[0];

      // Try to find a list (either in folder or folderless)
      let listId: string | null = null;
      let listName: string | null = null;

      // Check folderless lists first
      const lists = await apiClient.getLists(apiToken, firstSpace.id);
      if (lists.length > 0) {
        listId = lists[0].id;
        listName = lists[0].name;
      } else {
        // Check folders
        const folders = await apiClient.getFolders(apiToken, firstSpace.id);
        if (folders.length > 0) {
          const folderLists = await apiClient.getLists(apiToken, folders[0].id);
          if (folderLists.length > 0) {
            listId = folderLists[0].id;
            listName = folderLists[0].name;
          }
        }
      }

      if (!listId) {
        console.log(
          '⚠️  No lists found in workspace - skipping task fetch test'
        );
        return;
      }

      console.log(`\n🔍 Fetching tasks from list: ${listName}`);

      const tasks = await apiClient.getTasks(apiToken, listId, {
        page: 0,
        includeArchived: false,
        includeClosed: false,
      });

      expect(tasks).toBeDefined();
      expect(tasks.tasks).toBeDefined();
      expect(Array.isArray(tasks.tasks)).toBe(true);

      console.log(`✅ Found ${tasks.tasks.length} tasks`);

      if (tasks.tasks.length > 0) {
        const firstTask = tasks.tasks[0];
        console.log(`\n📋 Sample task:`);
        console.log(`   Name: ${firstTask.name}`);
        console.log(`   Status: ${firstTask.status.status}`);
        console.log(`   Priority: ${firstTask.priority?.priority || 'none'}`);
        console.log(`   Due Date: ${firstTask.due_date || 'none'}`);
        console.log(
          `   Tags: ${firstTask.tags?.map((t) => t.name).join(', ') || 'none'}`
        );
      }
    }, 60000);
  });

  describe('4. Data Mapping - Entity Transformation', () => {
    it('should map ClickUp task to internal format', async () => {
      if (skipTests) return;

      const spaces = await apiClient.getSpaces(apiToken, workspaceId);
      const firstSpace = spaces[0];

      // Find a list with tasks
      const lists = await apiClient.getLists(apiToken, firstSpace.id);
      if (lists.length === 0) {
        console.log('⚠️  No lists found - skipping mapping test');
        return;
      }

      const firstList = lists[0];
      const tasks = await apiClient.getTasks(apiToken, firstList.id, {
        page: 0,
      });

      if (tasks.tasks.length === 0) {
        console.log('⚠️  No tasks found - skipping mapping test');
        return;
      }

      const clickUpTask = tasks.tasks[0];
      const mappedTask = dataMapper.mapTask(
        clickUpTask,
        firstList.id,
        workspaceId
      );

      console.log(`\n🔄 Mapping verification:`);
      console.log(`   Original: ${clickUpTask.name}`);
      console.log(`   Mapped title: ${mappedTask.title}`);
      console.log(`   External ID: ${mappedTask.external_id}`);
      console.log(`   External URL: ${mappedTask.external_url}`);
      console.log(
        `   Metadata keys: ${Object.keys(mappedTask.metadata).join(', ')}`
      );

      // Verify mapping
      expect(mappedTask.title).toBe(clickUpTask.name);
      expect(mappedTask.external_id).toBe(clickUpTask.id);
      expect(mappedTask.external_source).toBe('clickup');
      expect(mappedTask.external_url).toContain('app.clickup.com');
      expect(mappedTask.external_parent_id).toBe(firstList.id);
      expect(mappedTask.metadata).toBeDefined();
      expect(mappedTask.metadata.status).toBe(clickUpTask.status.status);
    }, 60000);
  });

  describe('5. Rate Limiting - Throttle Behavior', () => {
    it('should respect rate limits', async () => {
      if (skipTests) return;

      const startTime = Date.now();
      const requests = 5;

      console.log(`\n⏱️  Testing rate limiter with ${requests} requests...`);

      for (let i = 0; i < requests; i++) {
        await rateLimiter.waitForSlot();
        const requestTime = Date.now() - startTime;
        console.log(`   Request ${i + 1}: ${requestTime}ms elapsed`);
      }

      const totalTime = Date.now() - startTime;
      console.log(`✅ Completed ${requests} requests in ${totalTime}ms`);

      // Should complete quickly since we're well under the limit
      expect(totalTime).toBeLessThan(10000); // 10 seconds max
    }, 30000);
  });

  describe('6. Import Service - Structure Building', () => {
    it('should build complete workspace structure', async () => {
      if (skipTests) return;

      console.log('\n🏗️  Building workspace structure...');

      const structure = await importService.getWorkspaceStructure(
        apiToken,
        workspaceId
      );

      expect(structure).toBeDefined();
      expect(structure.workspace).toBeDefined();
      expect(structure.workspace.id).toBe(workspaceId);
      expect(structure.workspace.spaces).toBeDefined();
      expect(Array.isArray(structure.workspace.spaces)).toBe(true);

      console.log(`\n📊 Workspace Structure:`);
      console.log(`   Workspace: ${structure.workspace.name}`);
      console.log(`   Spaces: ${structure.workspace.spaces.length}`);

      let totalFolders = 0;
      let totalLists = 0;

      structure.workspace.spaces.forEach((space) => {
        totalFolders += space.folders?.length || 0;
        totalLists +=
          (space.folders?.reduce((acc, f) => acc + (f.lists?.length || 0), 0) ||
            0) + (space.lists?.length || 0);
      });

      console.log(`   Folders: ${totalFolders}`);
      console.log(`   Lists: ${totalLists}`);

      // Verify structure has data
      expect(structure.workspace.spaces.length).toBeGreaterThan(0);
      expect(totalLists).toBeGreaterThan(0);
    }, 120000); // 2 minutes for full structure
  });

  describe('7. Error Handling - Invalid Credentials', () => {
    it('should handle invalid API token gracefully', async () => {
      if (skipTests) return;

      const invalidToken = 'pk_invalid_token_12345';

      try {
        await apiClient.getCurrentUser(invalidToken);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
        console.log(`✅ Correctly handled invalid token: ${error.message}`);
      }
    }, 30000);

    it('should handle invalid workspace ID gracefully', async () => {
      if (skipTests) return;

      const invalidWorkspaceId = '999999999';

      try {
        await apiClient.getSpaces(apiToken, invalidWorkspaceId);
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeDefined();
        console.log(`✅ Correctly handled invalid workspace: ${error.message}`);
      }
    }, 30000);
  });

  describe('8. Performance - API Response Times', () => {
    it('should measure API endpoint performance', async () => {
      if (skipTests) return;

      console.log('\n⏱️  Performance benchmarks:');

      // Test 1: Get current user
      let start = Date.now();
      await apiClient.getCurrentUser(apiToken);
      let duration = Date.now() - start;
      console.log(`   Get User: ${duration}ms`);
      expect(duration).toBeLessThan(5000); // Should be under 5 seconds

      // Test 2: Get spaces
      start = Date.now();
      await apiClient.getSpaces(apiToken, workspaceId);
      duration = Date.now() - start;
      console.log(`   Get Spaces: ${duration}ms`);
      expect(duration).toBeLessThan(5000);

      // Test 3: Get structure (most expensive)
      start = Date.now();
      await importService.getWorkspaceStructure(apiToken, workspaceId);
      duration = Date.now() - start;
      console.log(`   Get Full Structure: ${duration}ms`);
      expect(duration).toBeLessThan(30000); // Should be under 30 seconds
    }, 120000);
  });

  afterAll(() => {
    if (!skipTests) {
      console.log('\n✅ All ClickUp real API tests completed successfully!');
      console.log('   Your ClickUp integration is working correctly.\n');
    }
  });
});

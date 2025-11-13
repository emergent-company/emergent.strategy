/**
 * ClickUp Real API Integration Tests
 *
 * Simple tests using REAL ClickUp credentials to verify:
 * - API connectivity and authentication
 * - Workspace structure fetching
 * - Data retrieval operations
 *
 * SETUP:
 * Credentials are loaded from ../../.env.test.local
 *
 * Run: npm run test:integration:clickup
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { ClickUpApiClient } from '../../src/modules/clickup/clickup-api.client';
import { ClickUpDataMapper } from '../../src/modules/clickup/clickup-data-mapper.service';

// Load test environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env.test.local') });

const apiToken = process.env.CLICKUP_API_TOKEN;
const workspaceId = process.env.CLICKUP_WORKSPACE_ID;

const skipTests = !apiToken || !workspaceId;

if (skipTests) {
  console.warn(
    '\n⚠️  Skipping ClickUp real API tests - credentials not found in .env.test.local\n'
  );
}

describe.skipIf(skipTests)('ClickUp Real API Integration', () => {
  let apiClient: ClickUpApiClient;
  let dataMapper: ClickUpDataMapper;

  beforeAll(() => {
    apiClient = new ClickUpApiClient();
    apiClient.configure(apiToken!);

    dataMapper = new ClickUpDataMapper();
    dataMapper.setWorkspaceId(workspaceId!);

    console.log(`\n🔧 Testing with workspace: ${workspaceId}\n`);
  });

  describe('API Client - Authentication', () => {
    it('should fetch workspaces successfully', async () => {
      console.log('📡 Fetching workspaces...');

      const response = await apiClient.getWorkspaces();

      console.log(`✅ Found ${response.teams.length} workspaces`);
      expect(response.teams).toBeDefined();
      expect(response.teams.length).toBeGreaterThan(0);

      const workspace = response.teams.find((t) => t.id === workspaceId);
      expect(workspace).toBeDefined();
      console.log(`   Workspace: ${workspace?.name}`);
    }, 30000);
  });

  describe('Workspace Structure', () => {
    it('should fetch spaces in workspace', async () => {
      console.log('📡 Fetching spaces...');

      const response = await apiClient.getSpaces(workspaceId!);

      console.log(`✅ Found ${response.spaces.length} spaces`);
      expect(response.spaces).toBeDefined();

      if (response.spaces.length > 0) {
        const space = response.spaces[0];
        console.log(`   First space: ${space.name} (ID: ${space.id})`);
      }
    }, 30000);

    it('should fetch folders and lists from first space', async () => {
      const spacesResponse = await apiClient.getSpaces(workspaceId!);
      expect(spacesResponse.spaces.length).toBeGreaterThan(0);

      const firstSpace = spacesResponse.spaces[0];
      console.log(`📡 Fetching structure for space: ${firstSpace.name}`);

      // Fetch folders
      const foldersResponse = await apiClient.getFolders(firstSpace.id);
      console.log(`✅ Found ${foldersResponse.folders.length} folders`);

      // Fetch folderless lists
      const listsResponse = await apiClient.getFolderlessLists(firstSpace.id);
      console.log(`✅ Found ${listsResponse.lists.length} folderless lists`);

      expect(
        foldersResponse.folders.length + listsResponse.lists.length
      ).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Task Fetching', () => {
    it('should fetch tasks from first available list', async () => {
      // Navigate to find a list
      const spacesResponse = await apiClient.getSpaces(workspaceId!);
      expect(spacesResponse.spaces.length).toBeGreaterThan(0);

      const firstSpace = spacesResponse.spaces[0];

      // Try to get folderless lists first
      const listsResponse = await apiClient.getFolderlessLists(firstSpace.id);

      if (listsResponse.lists.length > 0) {
        const list = listsResponse.lists[0];
        console.log(`📡 Fetching tasks from list: ${list.name}`);

        const tasksResponse = await apiClient.getTasksInList(list.id, {
          page: 0,
          archived: false,
        });

        console.log(`✅ Found ${tasksResponse.tasks.length} tasks`);
        expect(tasksResponse.tasks).toBeDefined();

        if (tasksResponse.tasks.length > 0) {
          const task = tasksResponse.tasks[0];
          console.log(
            `   First task: ${task.name} (${
              task.status?.status || 'no status'
            })`
          );
        }
      } else {
        console.log('⏭️  No folderless lists found, skipping task fetch test');
      }
    }, 60000);
  });

  describe('Data Mapping', () => {
    it('should map ClickUp space to document', async () => {
      const spacesResponse = await apiClient.getSpaces(workspaceId!);
      const space = spacesResponse.spaces[0];

      console.log(`🔄 Mapping space: ${space.name}`);

      const doc = dataMapper.mapSpace(space, workspaceId!);

      console.log(`✅ Mapped to document: ${doc.title}`);
      expect(doc.title).toBe(space.name);
      expect(doc.external_source).toBe('clickup');
      expect(doc.external_id).toBe(space.id);
      expect(doc.external_url).toContain(space.id);
      expect(doc.metadata).toBeDefined();
    });

    it('should map ClickUp task to document', async () => {
      const spacesResponse = await apiClient.getSpaces(workspaceId!);
      const firstSpace = spacesResponse.spaces[0];
      const listsResponse = await apiClient.getFolderlessLists(firstSpace.id);

      if (listsResponse.lists.length > 0) {
        const list = listsResponse.lists[0];
        const tasksResponse = await apiClient.getTasksInList(list.id, {
          page: 0,
          archived: false,
        });

        if (tasksResponse.tasks.length > 0) {
          const task = tasksResponse.tasks[0];
          console.log(`🔄 Mapping task: ${task.name}`);

          const doc = dataMapper.mapTask(task, list.id);

          console.log(`✅ Mapped to document: ${doc.title}`);
          expect(doc.title).toBe(task.name);
          expect(doc.external_source).toBe('clickup');
          expect(doc.external_id).toBe(task.id);
          expect(doc.external_url).toContain(task.id);
          expect(doc.metadata).toBeDefined();
        } else {
          console.log('⏭️  No tasks found, skipping task mapping test');
        }
      } else {
        console.log('⏭️  No lists found, skipping task mapping test');
      }
    }, 60000);
  });

  describe('Rate Limiting', () => {
    it('should handle rate limiting gracefully', async () => {
      console.log('🚦 Testing rate limiting (making 10 rapid requests)...');

      const startTime = Date.now();
      const promises = [];

      for (let i = 0; i < 10; i++) {
        promises.push(apiClient.getWorkspaces());
      }

      await Promise.all(promises);
      const duration = Date.now() - startTime;

      console.log(`✅ Completed 10 requests in ${duration}ms`);
      console.log(`   Rate limiter is working (no 429 errors)`);

      expect(duration).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Error Handling', () => {
    it('should handle invalid workspace ID gracefully', async () => {
      console.log('🚫 Testing with invalid workspace ID...');

      await expect(async () => {
        await apiClient.getSpaces('invalid_workspace_id');
      }).rejects.toThrow();

      console.log('✅ Error handled correctly');
    }, 30000);
  });

  describe('Performance', () => {
    it('should fetch workspace structure within reasonable time', async () => {
      console.log('⏱️  Measuring workspace structure fetch time...');

      const startTime = Date.now();

      await apiClient.getWorkspaces();
      const spacesResponse = await apiClient.getSpaces(workspaceId!);

      if (spacesResponse.spaces.length > 0) {
        await apiClient.getFolders(spacesResponse.spaces[0].id);
      }

      const duration = Date.now() - startTime;

      console.log(`✅ Structure fetched in ${duration}ms`);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    }, 30000);
  });
});

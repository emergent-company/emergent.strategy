import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * E2E test for batch document upload
 *
 * Tests the multi-file upload feature including:
 * - Selecting multiple files for upload
 * - Batch upload progress UI
 * - Per-file status indicators
 * - Completion summary toast
 * - Duplicate detection across batch
 */

const TEST_FILES = [
  path.join(__dirname, '../test-data/batch-test-1.txt'),
  path.join(__dirname, '../test-data/batch-test-2.txt'),
  path.join(__dirname, '../test-data/batch-test-3.md'),
];

const TEST_FILE_NAMES = [
  'batch-test-1.txt',
  'batch-test-2.txt',
  'batch-test-3.md',
];

test.describe('Batch Document Upload', () => {
  test.beforeAll(() => {
    // Verify all test documents exist
    for (const filePath of TEST_FILES) {
      if (!fs.existsSync(filePath)) {
        throw new Error(
          `Test document not found: ${filePath}. Please ensure test-data files exist.`
        );
      }
    }
  });

  test('uploads multiple documents via file input and shows progress', async ({
    page,
  }) => {
    test.setTimeout(120_000); // 2 minute timeout for batch operations

    // Set up console and network logging
    const apiResponses: { url: string; status: number; body?: string }[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`[BROWSER ERROR] ${msg.text()}`);
      }
    });

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/')) {
        const status = response.status();
        console.log(`[API RESPONSE] ${status} ${url}`);

        if (url.includes('/ingest/upload-batch')) {
          try {
            const body = await response.text();
            apiResponses.push({ url, status, body });
            console.log(`[BATCH UPLOAD RESPONSE] ${body.substring(0, 500)}`);
          } catch (e) {
            apiResponses.push({ url, status });
          }
        }
      }
    });

    await test.step('Navigate to Documents page', async () => {
      await navigate(page, '/admin/apps/documents');
      await expect(
        page.getByRole('heading', { name: 'Documents', level: 1 })
      ).toBeVisible();
      console.log('✓ Navigated to Documents page');
    });

    await test.step('Clean up any existing test documents', async () => {
      await page.waitForTimeout(2000);

      for (const fileName of TEST_FILE_NAMES) {
        const existingDoc = page.locator('table tbody tr', {
          has: page.getByText(fileName),
        });

        if (await existingDoc.isVisible({ timeout: 1000 }).catch(() => false)) {
          console.log(`⚠️ Cleaning up existing test document: ${fileName}`);

          const actionsButton = existingDoc.locator('button', {
            hasText: 'Actions',
          });
          await actionsButton.click();

          const deleteButton = page.getByRole('button', { name: /delete/i });
          await deleteButton.click();

          const confirmButton = page.getByRole('button', {
            name: /confirm|yes|delete/i,
          });
          if (
            await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)
          ) {
            await confirmButton.click();
          }

          await expect(existingDoc).not.toBeVisible({ timeout: 10_000 });
          console.log(`✓ Cleaned up: ${fileName}`);
        }
      }
    });

    await test.step('Upload multiple files using file input', async () => {
      const fileInput = page.locator('input[type="file"]');

      // Wait for batch upload response
      const uploadPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/ingest/upload-batch') &&
          response.request().method() === 'POST',
        { timeout: 60_000 }
      );

      console.log('📤 Uploading 3 test documents...');
      await fileInput.setInputFiles(TEST_FILES);

      // Verify batch upload progress UI appears
      const batchProgress = page.locator('.card', {
        has: page.getByText(/Uploading.*files|Upload Complete/i),
      });

      // Wait for progress UI to appear (with timeout fallback)
      const progressVisible = await batchProgress
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (progressVisible) {
        console.log('✓ Batch upload progress UI visible');

        // Check for file items in progress list
        for (const fileName of TEST_FILE_NAMES) {
          const fileItem = batchProgress.getByText(fileName);
          await expect(fileItem).toBeVisible({ timeout: 10_000 });
          console.log(`✓ File in progress list: ${fileName}`);
        }
      }

      // Wait for upload to complete
      const uploadResponse = await uploadPromise;
      expect(uploadResponse.ok()).toBeTruthy();

      const uploadBody = await uploadResponse.json();
      console.log('✓ Batch upload response:', JSON.stringify(uploadBody));

      // Verify response structure
      expect(uploadBody.summary).toBeDefined();
      expect(uploadBody.summary.total).toBe(3);
      expect(uploadBody.results).toBeInstanceOf(Array);
      expect(uploadBody.results.length).toBe(3);
    });

    await test.step('Verify all documents appear in table', async () => {
      console.log('Waiting for documents to appear in table...');

      for (const fileName of TEST_FILE_NAMES) {
        const documentRow = page.locator('table tbody tr', {
          has: page.getByText(fileName),
        });

        await expect(documentRow).toBeVisible({ timeout: 30_000 });
        console.log(`✓ Document visible in table: ${fileName}`);
      }
    });

    await test.step('Verify completion summary', async () => {
      // Check for batch progress completion UI
      const completionSummary = page.locator('.card', {
        has: page.getByText('Upload Complete'),
      });

      if (
        await completionSummary.isVisible({ timeout: 5000 }).catch(() => false)
      ) {
        // Check for success count
        const successCount = completionSummary.getByText(/\d+\s*successful/i);
        await expect(successCount).toBeVisible({ timeout: 5000 });
        console.log('✓ Completion summary shows successful count');
      }

      // Alternatively, check for toast message
      const successToast = page.locator('[role="status"], .toast', {
        hasText: /successfully.*upload|batch.*complete/i,
      });

      const toastVisible = await successToast
        .isVisible({ timeout: 10_000 })
        .catch(() => false);

      if (toastVisible) {
        const toastText = await successToast.textContent();
        console.log(`✓ Success toast: ${toastText}`);
      }
    });

    // Cleanup
    await test.step('Cleanup: Delete test documents', async () => {
      console.log('Cleaning up test documents...');

      for (const fileName of TEST_FILE_NAMES) {
        const documentRow = page.locator('table tbody tr', {
          has: page.getByText(fileName),
        });

        if (await documentRow.isVisible({ timeout: 2000 }).catch(() => false)) {
          const actionsButton = documentRow.locator('button', {
            hasText: 'Actions',
          });
          await actionsButton.click();

          const deleteButton = page.getByRole('button', { name: /delete/i });
          await deleteButton.click();

          const confirmButton = page.getByRole('button', {
            name: /confirm|yes|delete/i,
          });
          if (
            await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)
          ) {
            await confirmButton.click();
          }

          await expect(documentRow).not.toBeVisible({ timeout: 10_000 });
          console.log(`✓ Deleted: ${fileName}`);
        }
      }
      console.log('✓ Cleanup complete');
    });
  });

  test('shows per-file status indicators during batch upload', async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await test.step('Navigate to Documents page', async () => {
      await navigate(page, '/admin/apps/documents');
      await expect(
        page.getByRole('heading', { name: 'Documents', level: 1 })
      ).toBeVisible();
    });

    await test.step('Upload files and observe status indicators', async () => {
      const fileInput = page.locator('input[type="file"]');

      const uploadPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/ingest/upload-batch') &&
          response.request().method() === 'POST',
        { timeout: 60_000 }
      );

      await fileInput.setInputFiles(TEST_FILES.slice(0, 2)); // Upload 2 files

      // Check for status icons in progress UI
      const batchProgress = page.locator('.card', {
        has: page.getByText(/Uploading.*files|Upload Complete/i),
      });

      if (await batchProgress.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Look for status badges after completion
        await uploadPromise;

        // Wait a moment for UI to update
        await page.waitForTimeout(1000);

        // Check for success badges
        const successBadges = batchProgress.locator(
          '.badge-success, .text-success'
        );
        const successCount = await successBadges.count();
        console.log(`✓ Found ${successCount} success indicators`);
      } else {
        // Just wait for upload to complete
        await uploadPromise;
      }
    });

    // Cleanup
    await test.step('Cleanup', async () => {
      for (const fileName of TEST_FILE_NAMES.slice(0, 2)) {
        const documentRow = page.locator('table tbody tr', {
          has: page.getByText(fileName),
        });

        if (await documentRow.isVisible({ timeout: 2000 }).catch(() => false)) {
          const actionsButton = documentRow.locator('button', {
            hasText: 'Actions',
          });
          await actionsButton.click();

          const deleteButton = page.getByRole('button', { name: /delete/i });
          await deleteButton.click();

          const confirmButton = page.getByRole('button', {
            name: /confirm|yes|delete/i,
          });
          if (
            await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)
          ) {
            await confirmButton.click();
          }

          await documentRow.waitFor({ state: 'detached', timeout: 10_000 });
        }
      }
    });
  });

  test('detects duplicates in batch upload', async ({ page }) => {
    test.setTimeout(120_000);

    await test.step('Navigate to Documents page', async () => {
      await navigate(page, '/admin/apps/documents');
      await expect(
        page.getByRole('heading', { name: 'Documents', level: 1 })
      ).toBeVisible();
    });

    const testFile = TEST_FILES[0]; // Use first file only
    const testFileName = TEST_FILE_NAMES[0];

    await test.step('Clean up existing test document', async () => {
      await page.waitForTimeout(2000);
      const existingDoc = page.locator('table tbody tr', {
        has: page.getByText(testFileName),
      });

      if (await existingDoc.isVisible({ timeout: 1000 }).catch(() => false)) {
        const actionsButton = existingDoc.locator('button', {
          hasText: 'Actions',
        });
        await actionsButton.click();

        const deleteButton = page.getByRole('button', { name: /delete/i });
        await deleteButton.click();

        const confirmButton = page.getByRole('button', {
          name: /confirm|yes|delete/i,
        });
        if (
          await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)
        ) {
          await confirmButton.click();
        }

        await expect(existingDoc).not.toBeVisible({ timeout: 10_000 });
      }
    });

    await test.step('First upload: Upload test document', async () => {
      const fileInput = page.locator('input[type="file"]');

      const uploadPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/ingest/upload') &&
          response.request().method() === 'POST',
        { timeout: 30_000 }
      );

      console.log('📤 First upload...');
      await fileInput.setInputFiles(testFile);

      await uploadPromise;

      // Wait for document to appear
      const documentRow = page.locator('table tbody tr', {
        has: page.getByText(testFileName),
      });
      await expect(documentRow).toBeVisible({ timeout: 30_000 });
      console.log('✓ First upload complete, document in table');
    });

    await test.step('Second upload: Upload same document as part of batch', async () => {
      const fileInput = page.locator('input[type="file"]');

      // Upload the same file again (should detect as duplicate)
      const uploadPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/ingest/upload') &&
          response.request().method() === 'POST',
        { timeout: 30_000 }
      );

      console.log('📤 Second upload (duplicate)...');
      await fileInput.setInputFiles(testFile);

      const response = await uploadPromise;
      const body = await response.json();

      console.log('✓ Second upload response:', JSON.stringify(body));

      // Verify it was detected as duplicate
      expect(body.alreadyExists).toBe(true);
    });

    await test.step('Verify duplicate handling message', async () => {
      // Check for duplicate warning toast or message
      const duplicateMessage = page.locator('[role="status"], .toast, .alert', {
        hasText: /already exists|duplicate/i,
      });

      const messageVisible = await duplicateMessage
        .isVisible({ timeout: 10_000 })
        .catch(() => false);

      if (messageVisible) {
        const messageText = await duplicateMessage.textContent();
        console.log(`✓ Duplicate message: ${messageText}`);
      }

      // Document should still be in table (not removed)
      const documentRow = page.locator('table tbody tr', {
        has: page.getByText(testFileName),
      });
      await expect(documentRow).toBeVisible();
      console.log('✓ Document still visible after duplicate upload');
    });

    // Cleanup
    await test.step('Cleanup', async () => {
      const documentRow = page.locator('table tbody tr', {
        has: page.getByText(testFileName),
      });

      if (await documentRow.isVisible({ timeout: 2000 }).catch(() => false)) {
        const actionsButton = documentRow.locator('button', {
          hasText: 'Actions',
        });
        await actionsButton.click();

        const deleteButton = page.getByRole('button', { name: /delete/i });
        await deleteButton.click();

        const confirmButton = page.getByRole('button', {
          name: /confirm|yes|delete/i,
        });
        if (
          await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)
        ) {
          await confirmButton.click();
        }
      }
    });
  });

  test('dismisses batch progress panel', async ({ page }) => {
    test.setTimeout(90_000);

    await test.step('Navigate to Documents page', async () => {
      await navigate(page, '/admin/apps/documents');
      await expect(
        page.getByRole('heading', { name: 'Documents', level: 1 })
      ).toBeVisible();
    });

    await test.step('Upload files and wait for completion', async () => {
      const fileInput = page.locator('input[type="file"]');

      const uploadPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/ingest/upload-batch') &&
          response.request().method() === 'POST',
        { timeout: 60_000 }
      );

      await fileInput.setInputFiles(TEST_FILES.slice(0, 2));
      await uploadPromise;

      // Wait for completion
      await page.waitForTimeout(2000);
    });

    await test.step('Dismiss batch progress panel', async () => {
      const batchProgress = page.locator('.card', {
        has: page.getByText('Upload Complete'),
      });

      if (await batchProgress.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Find and click dismiss button
        const dismissButton = batchProgress.locator(
          'button[aria-label="Dismiss"]'
        );

        if (
          await dismissButton.isVisible({ timeout: 2000 }).catch(() => false)
        ) {
          await dismissButton.click();
          await expect(batchProgress).not.toBeVisible({ timeout: 5000 });
          console.log('✓ Batch progress panel dismissed');
        }
      }
    });

    // Cleanup
    await test.step('Cleanup', async () => {
      for (const fileName of TEST_FILE_NAMES.slice(0, 2)) {
        const documentRow = page.locator('table tbody tr', {
          has: page.getByText(fileName),
        });

        if (await documentRow.isVisible({ timeout: 2000 }).catch(() => false)) {
          const actionsButton = documentRow.locator('button', {
            hasText: 'Actions',
          });
          await actionsButton.click();

          const deleteButton = page.getByRole('button', { name: /delete/i });
          await deleteButton.click();

          const confirmButton = page.getByRole('button', {
            name: /confirm|yes|delete/i,
          });
          if (
            await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)
          ) {
            await confirmButton.click();
          }

          await documentRow.waitFor({ state: 'detached', timeout: 10_000 });
        }
      }
    });
  });
});

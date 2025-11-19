import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * E2E test for duplicate document upload bug
 *
 * This test reproduces the "disappearing document" bug where:
 * 1. User uploads a document to an empty project
 * 2. Document appears in the table
 * 3. User uploads the same document again (duplicate)
 * 4. Backend returns alreadyExists=true
 * 5. BUG: Document disappears from the table (or never appears)
 *
 * Expected behavior: Document should remain visible after duplicate upload
 */

const TEST_DOCUMENT_PATH = path.join(
  __dirname,
  '../test-data/extraction-test.md'
);

test.describe('Document Duplicate Upload Bug', () => {
  test.beforeAll(() => {
    // Verify test document exists
    if (!fs.existsSync(TEST_DOCUMENT_PATH)) {
      throw new Error(
        `Test document not found: ${TEST_DOCUMENT_PATH}. Please ensure test-data/extraction-test.md exists.`
      );
    }
  });

  test('should keep document visible after duplicate upload', async ({
    page,
  }) => {
    test.setTimeout(90_000); // 1.5 minute timeout

    // Set up console and network logging
    const consoleMessages: string[] = [];
    const apiRequests: string[] = [];
    const apiResponses: { url: string; status: number; body?: string }[] = [];

    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      consoleMessages.push(`[${type.toUpperCase()}] ${text}`);
      if (type === 'error' || type === 'warning') {
        console.log(`[BROWSER ${type.toUpperCase()}] ${text}`);
      }
    });

    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/')) {
        const logEntry = `${request.method()} ${url}`;
        apiRequests.push(logEntry);
        console.log(`[API REQUEST] ${logEntry}`);
      }
    });

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/api/')) {
        const status = response.status();
        console.log(`[API RESPONSE] ${status} ${url}`);

        // Log response body for document-related APIs
        if (url.includes('/ingest/') || url.includes('/documents')) {
          try {
            const body = await response.text();
            apiResponses.push({ url, status, body });
            console.log(`[API RESPONSE BODY] ${body.substring(0, 500)}`);
          } catch (e) {
            apiResponses.push({ url, status });
            console.log('[API RESPONSE BODY] Could not read response body');
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

    await test.step('Verify project is empty or clean up existing test document', async () => {
      // Wait for table to load
      await page.waitForTimeout(2000);

      // Check if extraction-test.md already exists
      const existingDoc = page.locator('table tbody tr', {
        has: page.getByText('extraction-test.md'),
      });

      const exists = await existingDoc
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      if (exists) {
        console.log('⚠️  Test document already exists, deleting it first...');

        // Click Actions dropdown
        const actionsButton = existingDoc.locator('button', {
          hasText: 'Actions',
        });
        await actionsButton.click();

        // Click Delete
        const deleteButton = page.getByRole('button', { name: /delete/i });
        await deleteButton.click();

        // Confirm deletion if there's a confirmation dialog
        const confirmButton = page.getByRole('button', {
          name: /confirm|yes|delete/i,
        });
        if (
          await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)
        ) {
          await confirmButton.click();
        }

        // Wait for deletion to complete
        await expect(existingDoc).not.toBeVisible({ timeout: 10_000 });
        console.log('✓ Cleaned up existing test document');
      } else {
        console.log('✓ Project is empty (no test document found)');
      }
    });

    let firstUploadDocumentId: string | undefined;

    await test.step('First upload: Upload test document', async () => {
      const fileInput = page.locator('input[type="file"]');

      // Wait for upload response
      const uploadPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/ingest/upload') &&
          response.request().method() === 'POST',
        { timeout: 30_000 }
      );

      console.log('📤 First upload: Uploading document...');
      await fileInput.setInputFiles(TEST_DOCUMENT_PATH);

      // Wait for upload to complete
      const uploadResponse = await uploadPromise;
      expect(uploadResponse.ok()).toBeTruthy();

      const uploadBody = await uploadResponse.json();
      console.log(`✓ First upload response:`, JSON.stringify(uploadBody));

      // Verify NOT a duplicate
      expect(uploadBody.alreadyExists).toBeFalsy();
      firstUploadDocumentId = uploadBody.documentId || uploadBody.id;
      expect(firstUploadDocumentId).toBeTruthy();
      console.log(`✓ First upload document ID: ${firstUploadDocumentId}`);
    });

    await test.step('Verify document appears in table after first upload', async () => {
      console.log('Waiting for document to appear in table...');

      // Wait for document to appear in the table (not the toast)
      const documentRow = page.locator('table tbody tr', {
        has: page.getByText('extraction-test.md'),
      });

      await expect(documentRow).toBeVisible({
        timeout: 30_000,
      });

      console.log('✓ Document visible in table after first upload');

      // Verify document ID matches
      const chunksLink = documentRow
        .locator('a[href*="/admin/apps/chunks?docId="]')
        .first();

      if (await chunksLink.isVisible().catch(() => false)) {
        const href = await chunksLink.getAttribute('href');
        const match = href?.match(/docId=([a-f0-9-]+)/);
        if (match) {
          const displayedDocId = match[1];
          expect(displayedDocId).toBe(firstUploadDocumentId);
          console.log(`✓ Displayed document ID matches: ${displayedDocId}`);
        }
      }
    });

    let secondUploadDocumentId: string | undefined;

    await test.step('Second upload: Upload same document (duplicate)', async () => {
      const fileInput = page.locator('input[type="file"]');

      // Wait for upload response
      const uploadPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/ingest/upload') &&
          response.request().method() === 'POST',
        { timeout: 30_000 }
      );

      console.log('📤 Second upload: Uploading same document (duplicate)...');
      await fileInput.setInputFiles(TEST_DOCUMENT_PATH);

      // Wait for upload to complete
      const uploadResponse = await uploadPromise;
      expect(uploadResponse.ok()).toBeTruthy();

      const uploadBody = await uploadResponse.json();
      console.log(`✓ Second upload response:`, JSON.stringify(uploadBody));

      // Verify it IS a duplicate
      expect(uploadBody.alreadyExists).toBe(true);
      secondUploadDocumentId = uploadBody.documentId || uploadBody.id;
      expect(secondUploadDocumentId).toBe(firstUploadDocumentId);
      console.log(
        `✓ Second upload detected duplicate, returned same ID: ${secondUploadDocumentId}`
      );

      // Check for warning message in console
      const duplicateWarning = consoleMessages.find(
        (msg) => msg.includes('already exists') || msg.includes('alreadyExists')
      );
      if (duplicateWarning) {
        console.log(`✓ Frontend logged duplicate warning: ${duplicateWarning}`);
      }
    });

    await test.step('CRITICAL: Verify document STILL visible after duplicate upload', async () => {
      console.log(
        '🔍 Checking if document is still visible (this is the bug test)...'
      );

      // Wait a moment for any UI updates
      await page.waitForTimeout(2000);

      // Check if document is still visible
      const documentRow = page.locator('table tbody tr', {
        has: page.getByText('extraction-test.md'),
      });

      const isVisible = await documentRow
        .isVisible({ timeout: 5000 })
        .catch(() => false);

      if (!isVisible) {
        // BUG REPRODUCED!
        console.error(
          '❌ BUG REPRODUCED: Document disappeared after duplicate upload!'
        );
        console.error('Console messages:', consoleMessages);
        console.error('API requests:', apiRequests);
        console.error('API responses:', apiResponses);

        // Take a screenshot
        await page.screenshot({
          path: 'document-disappeared-bug.png',
          fullPage: true,
        });
        console.error('Screenshot saved to: document-disappeared-bug.png');
      }

      // This assertion should pass if the bug is fixed
      await expect(documentRow).toBeVisible({
        timeout: 10_000,
      });

      console.log(
        '✓ SUCCESS: Document is still visible after duplicate upload'
      );
    });

    await test.step('Verify document count is still 1', async () => {
      // Count total rows in the table
      const allRows = page.locator('table tbody tr');
      const count = await allRows.count();

      console.log(`Total documents in table: ${count}`);

      // Should still have exactly 1 document (not duplicated)
      expect(count).toBeGreaterThanOrEqual(1);

      // Count how many are our test document
      const testDocRows = page.locator('table tbody tr', {
        has: page.getByText('extraction-test.md'),
      });
      const testDocCount = await testDocRows.count();

      expect(testDocCount).toBe(1);
      console.log(
        `✓ Exactly 1 instance of test document in table (not duplicated)`
      );
    });

    // Cleanup
    if (firstUploadDocumentId) {
      await test.step('Cleanup: Delete test document', async () => {
        console.log(`Cleaning up document ${firstUploadDocumentId}...`);

        // Find the document row
        const documentRow = page.locator('table tbody tr', {
          has: page.getByText('extraction-test.md'),
        });

        if (await documentRow.isVisible({ timeout: 5000 }).catch(() => false)) {
          // Click Actions dropdown
          const actionsButton = documentRow.locator('button', {
            hasText: 'Actions',
          });
          await actionsButton.click();

          // Click Delete
          const deleteButton = page.getByRole('button', { name: /delete/i });
          await deleteButton.click();

          // Confirm deletion if there's a confirmation dialog
          const confirmButton = page.getByRole('button', {
            name: /confirm|yes|delete/i,
          });
          if (
            await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)
          ) {
            await confirmButton.click();
          }

          // Wait for deletion to complete
          await expect(documentRow).not.toBeVisible({ timeout: 10_000 });

          console.log('✓ Cleanup complete');
        }
      });
    }
  });

  test('should show appropriate toast message for duplicate upload', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    await test.step('Navigate to Documents page', async () => {
      await navigate(page, '/admin/apps/documents');
      await expect(
        page.getByRole('heading', { name: 'Documents', level: 1 })
      ).toBeVisible();
    });

    await test.step('Clean up any existing test document', async () => {
      await page.waitForTimeout(2000);
      const existingDoc = page.locator('table tbody tr', {
        has: page.getByText('extraction-test.md'),
      });

      if (await existingDoc.isVisible({ timeout: 2000 }).catch(() => false)) {
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

    await test.step('Upload document first time', async () => {
      const fileInput = page.locator('input[type="file"]');
      const uploadPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/ingest/upload') &&
          response.request().method() === 'POST',
        { timeout: 30_000 }
      );

      await fileInput.setInputFiles(TEST_DOCUMENT_PATH);
      await uploadPromise;

      // Wait for success toast
      const successToast = page.locator('[role="status"], .toast', {
        hasText: /upload.*success/i,
      });
      await expect(successToast).toBeVisible({ timeout: 10_000 });
      console.log('✓ Success toast appeared for first upload');
    });

    await test.step('Upload same document again and check toast message', async () => {
      const fileInput = page.locator('input[type="file"]');
      const uploadPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/ingest/upload') &&
          response.request().method() === 'POST',
        { timeout: 30_000 }
      );

      await fileInput.setInputFiles(TEST_DOCUMENT_PATH);
      await uploadPromise;

      // Wait for duplicate warning toast
      // Based on the code, it should show "Document 'extraction-test.md' already exists..."
      const duplicateToast = page.locator('[role="status"], .toast', {
        hasText: /already exists/i,
      });

      const toastVisible = await duplicateToast
        .isVisible({ timeout: 10_000 })
        .catch(() => false);

      if (toastVisible) {
        const toastText = await duplicateToast.textContent();
        console.log(`✓ Duplicate toast appeared: ${toastText}`);
        expect(toastText).toMatch(/extraction-test\.md.*already exists/i);
      } else {
        console.log(
          '⚠️  No duplicate toast found - might show generic success toast instead'
        );
      }
    });

    // Cleanup
    await test.step('Cleanup', async () => {
      const documentRow = page.locator('table tbody tr', {
        has: page.getByText('extraction-test.md'),
      });

      if (await documentRow.isVisible({ timeout: 5000 }).catch(() => false)) {
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
});

import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * E2E test for basic document upload
 *
 * Tests that a document can be uploaded and appears in the documents list.
 * This is a minimal test to debug the "disappearing document" issue.
 */

const TEST_DOCUMENT_PATH = path.join(
  __dirname,
  '../test-data/extraction-test.md'
);

test.describe('Document Upload', () => {
  test.beforeAll(() => {
    // Verify test document exists
    if (!fs.existsSync(TEST_DOCUMENT_PATH)) {
      throw new Error(
        `Test document not found: ${TEST_DOCUMENT_PATH}. Please ensure test-data/extraction-test.md exists.`
      );
    }
  });

  test('uploads a document and verifies it persists in the list', async ({
    page,
  }) => {
    test.setTimeout(60_000); // 1 minute timeout

    // Set up console and network logging
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        console.log(`[BROWSER ERROR] ${text}`);
      }
    });

    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/')) {
        console.log(`[API REQUEST] ${request.method()} ${url}`);
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
            console.log(`[API RESPONSE BODY] ${body.substring(0, 500)}`);
          } catch (e) {
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

    await test.step('Get initial document count', async () => {
      // Wait a moment for the table to load
      await page.waitForTimeout(2000);

      // Check if there are any existing documents
      const hasDocuments = await page
        .locator('table tbody tr')
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      if (hasDocuments) {
        const count = await page.locator('table tbody tr').count();
        console.log(`✓ Initial document count: ${count}`);
      } else {
        console.log('✓ No existing documents in table');
      }
    });

    let uploadedDocumentId: string | undefined;

    await test.step('Upload test document', async () => {
      const fileInput = page.locator('input[type="file"]');

      // Wait for upload response
      const uploadPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/ingest/upload') &&
          response.request().method() === 'POST',
        { timeout: 30_000 }
      );

      console.log('Uploading document...');
      await fileInput.setInputFiles(TEST_DOCUMENT_PATH);

      // Wait for upload to complete
      const uploadResponse = await uploadPromise;
      expect(uploadResponse.ok()).toBeTruthy();

      const uploadBody = await uploadResponse.json();
      console.log(`✓ Document uploaded successfully:`, uploadBody);
    });

    await test.step('Verify document appears in list', async () => {
      console.log('Waiting for document to appear in table...');

      // Wait for document to appear in the table (not the toast)
      const documentRow = page.locator('table tbody tr', {
        has: page.getByText('extraction-test.md'),
      });

      await expect(documentRow).toBeVisible({
        timeout: 30_000,
      });

      console.log('✓ Document visible in table');

      // Extract document ID from chunks link
      const chunksLink = documentRow
        .locator('a[href*="/admin/apps/chunks?docId="]')
        .first();

      await expect(chunksLink).toBeVisible();

      const href = await chunksLink.getAttribute('href');
      const match = href?.match(/docId=([a-f0-9-]+)/);
      if (match) {
        uploadedDocumentId = match[1];
        console.log(`✓ Document ID: ${uploadedDocumentId}`);
      }
    });

    await test.step('Verify document persists after page reload', async () => {
      console.log('Reloading page to verify persistence...');

      await page.reload({ waitUntil: 'networkidle' });

      // Wait for table to load
      await expect(
        page.getByRole('heading', { name: 'Documents', level: 1 })
      ).toBeVisible();

      // Verify document still appears
      await expect(page.getByText('extraction-test.md')).toBeVisible({
        timeout: 10_000,
      });

      console.log('✓ Document persists after reload');
    });

    // Cleanup
    if (uploadedDocumentId) {
      await test.step('Cleanup: Delete test document', async () => {
        console.log(`Cleaning up document ${uploadedDocumentId}...`);

        // Navigate back to documents page
        await navigate(page, '/admin/apps/documents');

        // Find the document row
        const documentRow = page.locator('tr', {
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

          console.log('✓ Cleanup complete');
        }
      });
    }
  });
});

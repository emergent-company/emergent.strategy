import { test, expect } from '../fixtures/app';
import { navigate } from '../utils/navigation';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * E2E test for extraction workflow (full flow with real backend)
 *
 * Tests the complete user journey:
 * 1. Upload a document containing known entities
 * 2. Verify that chunks were created
 * 3. Open extraction modal from document actions
 * 4. Use default extraction settings
 * 5. Start extraction job
 * 6. Verify extraction completes successfully
 * 7. Verify entities were extracted (Person, Organization, Location)
 *
 * Test requirements:
 * - Demo pack must be seeded (run scripts/seed-extraction-demo.ts)
 * - Real LLM backend is used (not mocked) - test may be slow
 * - Test document fixture must exist at test-data/extraction-test.md
 *
 * Mocked: None (full integration test)
 * Real: Database, LLM API, file upload, extraction worker
 * Auth: Uses authenticated session from app fixture
 */

const TEST_DOCUMENT_PATH = path.join(
  __dirname,
  '../test-data/extraction-test.md'
);

// Expected entities in the test document
const EXPECTED_PERSONS = ['Sarah Chen', 'Michael Rodriguez', 'Emma Watson'];
const EXPECTED_ORGS = [
  'TechVenture Inc',
  'DataStream Solutions',
  'CloudScale Systems',
];
const EXPECTED_LOCATIONS = [
  'San Francisco',
  'Austin',
  'Seattle',
  'London',
  'Berlin',
  'Boston',
];

test.describe('Extraction Full Flow', () => {
  let documentId: string | undefined;
  let extractionJobId: string | undefined;

  test.beforeAll(() => {
    // Verify test document exists
    if (!fs.existsSync(TEST_DOCUMENT_PATH)) {
      throw new Error(
        `Test document not found: ${TEST_DOCUMENT_PATH}. Please ensure test-data/extraction-test.md exists.`
      );
    }
  });

  // Note: Cleanup will happen at the end of the test step
  // We can't use afterAll with page fixture, so cleanup is manual

  test('completes full extraction workflow from upload to entities', async ({
    page,
  }) => {
    // Set longer timeout for this test (extraction can take several minutes)
    test.setTimeout(600_000); // 10 minutes

    // Set up console logging to capture all browser console messages
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();

      // Log with prefix to distinguish from test logs
      if (type === 'error') {
        console.log(`[BROWSER ERROR] ${text}`);
      } else if (type === 'warning') {
        console.log(`[BROWSER WARN] ${text}`);
      } else if (
        text.includes('toast') ||
        text.includes('Toast') ||
        text.includes('notification')
      ) {
        console.log(`[BROWSER TOAST] ${text}`);
      } else if (type === 'log' || type === 'info') {
        console.log(`[BROWSER LOG] ${text}`);
      }
    });

    // Set up page error logging
    page.on('pageerror', (error) => {
      console.log(`[BROWSER PAGE ERROR] ${error.message}`);
      console.log(`[BROWSER PAGE ERROR STACK] ${error.stack}`);
    });

    // Set up network request logging for API calls
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

        // Log error responses with body
        if (status >= 400) {
          try {
            const body = await response.text();
            console.log(`[API ERROR BODY] ${body}`);
          } catch (e) {
            console.log('[API ERROR BODY] Could not read response body');
          }
        }
      }
    });

    // Inject a script to intercept toast messages
    await page.addInitScript(() => {
      // Intercept any toast/notification functions
      const originalConsoleLog = console.log;
      const originalConsoleError = console.error;
      const originalConsoleWarn = console.warn;

      console.log = (...args: any[]) => {
        originalConsoleLog.apply(console, args);
      };

      console.error = (...args: any[]) => {
        originalConsoleError.apply(console, ['[TOAST-ERROR]', ...args]);
      };

      console.warn = (...args: any[]) => {
        originalConsoleWarn.apply(console, ['[TOAST-WARN]', ...args]);
      };

      // Try to intercept toast library if available
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              // Check for toast/alert/notification elements
              if (
                node.classList.contains('alert') ||
                node.classList.contains('toast') ||
                node.classList.contains('notification') ||
                node.getAttribute('role') === 'alert'
              ) {
                console.log(
                  '[TOAST-MUTATION] Toast element added:',
                  node.textContent
                );
              }
            }
          });
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    });

    await test.step('Navigate to Documents page', async () => {
      await navigate(page, '/admin/apps/documents');
      await expect(
        page.getByRole('heading', { name: 'Documents', level: 1 })
      ).toBeVisible();
    });

    await test.step('Upload test document', async () => {
      // Find the file input and upload the file directly
      // (There are multiple "upload document" buttons, so we target the file input directly)
      const fileInput = page.locator('input[type="file"]');

      // Wait for response after upload (goes to /api/ingest/upload, not /api/documents)
      const uploadPromise = page.waitForResponse(
        (response) =>
          response.url().includes('/api/ingest/upload') &&
          response.request().method() === 'POST',
        { timeout: 30_000 }
      );

      await fileInput.setInputFiles(TEST_DOCUMENT_PATH);

      // Wait for upload to complete
      const uploadResponse = await uploadPromise;
      expect(uploadResponse.ok()).toBeTruthy();

      console.log('Document uploaded, waiting for it to appear in table...');

      // Wait for document to appear in list (may take a moment for chunking to complete)
      await expect(page.getByText('extraction-test.md')).toBeVisible({
        timeout: 30_000,
      });

      // Extract document ID from the page
      // The document should be visible in the table with a link to chunks
      // Use .first() since there are multiple links (table cell badge + dropdown menu item)
      const chunksLink = page
        .locator('tr', { has: page.getByText('extraction-test.md') })
        .locator('a[href*="/admin/apps/chunks?docId="]')
        .first();
      await expect(chunksLink).toBeVisible();

      const href = await chunksLink.getAttribute('href');
      const match = href?.match(/docId=([a-f0-9-]+)/);
      if (!match) {
        throw new Error('Could not extract document ID from chunks link');
      }
      documentId = match[1];
      console.log(`Uploaded document ID: ${documentId}`);
    });

    await test.step('Verify chunks were created', async () => {
      // Navigate to chunks page filtered by document
      await navigate(page, `/admin/apps/chunks?docId=${documentId}`);

      // Wait for chunks to load
      await expect(page.getByRole('heading', { name: 'Chunks' })).toBeVisible();

      // Verify at least one chunk exists
      const chunkRows = page.locator('table tbody tr');
      await expect(chunkRows.first()).toBeVisible({ timeout: 10_000 });

      // Verify chunks show the correct document name (use .first() since document name appears multiple times)
      await expect(page.getByText('extraction-test.md').first()).toBeVisible();

      console.log('Chunks verified successfully');
    });

    await test.step('Navigate back to Documents and open extraction modal', async () => {
      await navigate(page, '/admin/apps/documents');

      // Find the row for our test document
      const documentRow = page.locator('tr', {
        has: page.getByText('extraction-test.md'),
      });
      await expect(documentRow).toBeVisible();

      // Scroll the row into view to ensure the dropdown button is visible
      await documentRow.scrollIntoViewIfNeeded();

      // Click the Actions dropdown trigger (wrapped in label + button structure)
      // The button text is "Actions" with a chevron icon
      const actionsButton = documentRow.locator('button', {
        hasText: 'Actions',
      });
      await actionsButton.waitFor({ state: 'visible', timeout: 5000 });
      await actionsButton.click();

      // Click the Extract button in the dropdown menu
      const extractButton = page.getByRole('button', { name: /extract/i });
      await expect(extractButton).toBeVisible();
      await extractButton.click();

      // Wait for extraction modal to open
      const modal = page.locator('dialog[open]');
      await expect(modal).toBeVisible({ timeout: 5_000 });
      await expect(
        modal.getByRole('heading', { name: /extract objects/i })
      ).toBeVisible();
    });

    await test.step('Verify default extraction settings', async () => {
      const modal = page.locator('dialog[open]');

      // Verify source document is shown
      await expect(modal.getByText('extraction-test.md')).toBeVisible();

      // Verify modal header
      await expect(
        modal.getByRole('heading', { name: /extract objects/i })
      ).toBeVisible();

      // Verify Start Extraction button is present
      const startButton = modal.getByRole('button', {
        name: /start extraction/i,
      });
      await expect(startButton).toBeVisible();

      console.log(
        'Default extraction settings verified - modal is open with start button'
      );
    });

    await test.step('Start extraction', async () => {
      const modal = page.locator('dialog[open]');
      const startButton = modal.getByRole('button', {
        name: /start extraction/i,
      });

      // Verify button is enabled and visible
      await expect(startButton).toBeVisible();
      await expect(startButton).toBeEnabled();

      console.log('Start extraction button is visible and enabled');

      // Click to start extraction
      await startButton.click();
      console.log('Clicked start extraction button');

      // Wait for success toast (appears before navigation)
      try {
        await page
          .locator('text=/Extraction job created successfully/i')
          .waitFor({
            state: 'visible',
            timeout: 5_000,
          });
        console.log('Success toast appeared');
      } catch (e) {
        console.warn('Success toast did not appear (might have been too fast)');
      }

      // Wait for navigation to extraction job detail page (happens after 1s delay per code)
      await page.waitForURL(/\/admin\/extraction-jobs\/[a-f0-9-]+/, {
        timeout: 10_000,
      });

      console.log(`Navigated to: ${page.url()}`);

      // Extract job ID from URL
      const match = page.url().match(/\/admin\/extraction-jobs\/([a-f0-9-]+)/);
      if (match) {
        extractionJobId = match[1];
        console.log(`Extraction job ID: ${extractionJobId}`);
      } else {
        throw new Error(`Failed to extract job ID from URL: ${page.url()}`);
      }
    });

    await test.step('Monitor extraction job until completion', async () => {
      // Navigate to extraction jobs page
      await navigate(page, '/admin/extraction-jobs');

      // Wait for the page to load
      await expect(
        page.getByRole('heading', { name: /extraction jobs/i })
      ).toBeVisible();

      // Find our extraction job (most recent one for our document)
      // Poll for job completion (extraction may take a while with real LLM)
      let jobCompleted = false;
      let jobStatus = '';
      const maxAttempts = 120; // 10 minutes max wait (5 second intervals)
      let attempt = 0;

      while (!jobCompleted && attempt < maxAttempts) {
        attempt++;

        // Refresh the page to get latest job status
        await page.reload();
        await page.waitForLoadState('networkidle');

        // Look for completed status - jobs are displayed as buttons
        // Status can be "Completed" or "Needs Review" (both indicate extraction finished)
        const completedJob = page
          .locator('button', {
            has: page.getByText('extraction-test.md'),
          })
          .filter({ hasText: /completed|needs review/i })
          .first();

        const isVisible = await completedJob
          .isVisible({ timeout: 2_000 })
          .catch(() => false);

        if (isVisible) {
          jobCompleted = true;

          // Extract the status from the button text
          const buttonText = await completedJob.textContent();
          const statusMatch = buttonText?.match(/(Completed|Needs Review)/i);
          jobStatus = statusMatch ? statusMatch[1] : 'Unknown';

          console.log(
            `Extraction job completed with status "${jobStatus}" after ${
              attempt * 5
            } seconds`
          );
          break;
        }

        // Check if job is still running or pending
        const runningJob = page
          .locator('button', {
            has: page.getByText('extraction-test.md'),
          })
          .filter({ hasText: /running|pending/i })
          .first();

        const isRunning = await runningJob
          .isVisible({ timeout: 2_000 })
          .catch(() => false);

        if (isRunning) {
          const buttonText = await runningJob.textContent();
          const statusMatch = buttonText?.match(/(Running|Pending)/i);
          const currentStatus = statusMatch ? statusMatch[1] : 'In Progress';
          console.log(
            `Attempt ${attempt}/${maxAttempts}: Job status is "${currentStatus}"`
          );
        } else {
          console.log(
            `Attempt ${attempt}/${maxAttempts}: Job not found yet, waiting...`
          );
        }

        // Wait 5 seconds before next check
        await page.waitForTimeout(5_000);
      }

      if (!jobCompleted) {
        throw new Error(
          'Extraction job did not complete within 10 minutes. This may indicate a backend issue or the LLM API is slow.'
        );
      }

      console.log(
        `✓ Extraction job finished successfully with status: ${jobStatus}`
      );
    });

    await test.step('Verify extracted entities', async () => {
      // Navigate to Objects page
      await navigate(page, '/admin/objects');

      await expect(
        page.getByRole('heading', { name: /objects/i })
      ).toBeVisible();

      // Verify some of the expected entities were extracted
      // We'll check for at least one person, one org, and one location
      const verifyEntity = async (name: string, type: string) => {
        // Search or filter for the entity
        const searchBox = page.locator(
          'input[type="search"], input[placeholder*="search" i]'
        );
        if (await searchBox.isVisible().catch(() => false)) {
          await searchBox.fill(name);
          await page.waitForTimeout(1_000); // Wait for search to filter
        }

        // Look for the entity in the table
        const entityRow = page.locator('tr', { hasText: name });
        const isVisible = await entityRow
          .isVisible({ timeout: 5_000 })
          .catch(() => false);

        if (isVisible) {
          console.log(`✓ Found extracted ${type}: ${name}`);
          return true;
        } else {
          console.warn(`✗ Expected ${type} not found: ${name}`);
          return false;
        }
      };

      // Check for at least one entity of each type
      let foundPerson = false;
      for (const person of EXPECTED_PERSONS) {
        if (await verifyEntity(person, 'Person')) {
          foundPerson = true;
          break;
        }
      }

      let foundOrg = false;
      for (const org of EXPECTED_ORGS) {
        if (await verifyEntity(org, 'Organization')) {
          foundOrg = true;
          break;
        }
      }

      let foundLocation = false;
      for (const location of EXPECTED_LOCATIONS) {
        if (await verifyEntity(location, 'Location')) {
          foundLocation = true;
          break;
        }
      }

      // Assert that we found at least one of each type
      expect(foundPerson).toBe(true);
      expect(foundOrg).toBe(true);
      expect(foundLocation).toBe(true);

      console.log('Entity extraction verified successfully');
    });

    await test.step('Test complete', async () => {
      console.log('✅ Full extraction workflow test completed successfully!');
      console.log(`- Document uploaded: ${documentId}`);
      console.log('- Chunks created and verified');
      console.log('- Extraction job completed');
      console.log('- Entities extracted and verified');
    });

    await test.step('Cleanup test data', async () => {
      // Cleanup: delete uploaded document and extraction job
      if (documentId) {
        try {
          console.log(`Cleaning up document: ${documentId}`);
          await page.request.delete(`/api/documents/${documentId}`);
          console.log('Document deleted successfully');
        } catch (error) {
          console.warn('Failed to cleanup document:', error);
        }
      }
      if (extractionJobId) {
        try {
          console.log(`Cleaning up extraction job: ${extractionJobId}`);
          await page.request.delete(
            `/api/admin/extraction-jobs/${extractionJobId}`
          );
          console.log('Extraction job deleted successfully');
        } catch (error) {
          console.warn('Failed to cleanup extraction job:', error);
        }
      }
    });
  });
});

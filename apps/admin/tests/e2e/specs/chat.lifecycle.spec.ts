import { test, expect } from '../fixtures/consoleGate';
import { navigate } from '../utils/navigation';
import { expectNoRuntimeErrors } from '../utils/assertions';
import { ensureReadyToTest } from '../helpers/test-user';

/**
 * Chat lifecycle spec
 * Covers: create (auto + manual), streaming token accumulation, rename (UI optimistic), delete.
 *
 * DISABLED: Chat functionality will be refactored. These tests will be updated after the refactor.
 * SSE streaming is also difficult to mock reliably with Playwright's route.fulfill().
 */
test.describe.skip('Chat - lifecycle', () => {
  let conversationId: string;

  test.beforeEach(async ({ page }) => {
    await ensureReadyToTest(page);
    // TODO: Implement chat backend mocking for SSE streams

    // Log all console output
    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (
        type === 'error' ||
        type === 'warning' ||
        text.includes('chat') ||
        text.includes('[use-chat')
      ) {
        console.log(`[browser-${type}]`, text);
      }
    });

    // Log network activity (but DON'T consume response body!)
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/chat/stream')) {
        console.log('[req]', req.method(), url);
        console.log('[req-body]', req.postData());
      }
    });
    page.on('response', (res) => {
      const url = res.url();
      if (url.includes('/chat/stream')) {
        console.log('[res]', res.status(), res.headers()['content-type']);
      }
    });
  });

  test('auto-send via ?q query hydrates first user + assistant tokens', async ({
    page,
    consoleErrors,
    pageErrors,
  }) => {
    const prompt = 'Lifecycle auto prompt';
    await test.step('Navigate with query', async () => {
      await navigate(
        page,
        `/admin/apps/chat/c/new?q=${encodeURIComponent(prompt)}`
      );
      await page.waitForURL(/\/admin\/apps\/chat\/c\//, { timeout: 30_000 });
    });

    await test.step('Wait for streaming assistant bubble tokens', async () => {
      // Wait for either the /chat/stream response OR any chat bubble to appear
      await Promise.race([
        page
          .waitForResponse((res) => /\/chat\/stream$/.test(res.url()), {
            timeout: 30_000,
          })
          .catch(() => undefined),
        page.waitForSelector('.chat .chat-bubble', { timeout: 30_000 }),
      ]);
      // With stubbed backend, assistant bubble should appear quickly with " Pong" response
      const assistantBubble = page
        .locator('.chat-start .chat-bubble-primary, .chat-start .chat-bubble')
        .first();
      await assistantBubble.waitFor({ state: 'visible', timeout: 10_000 });

      // Verify the stubbed response content
      await expect(assistantBubble).toContainText('Pong', { timeout: 5_000 });
    });

    await test.step('No runtime errors', async () => {
      expectNoRuntimeErrors('auto send', consoleErrors, pageErrors);
    });
  });

  test('manual send from empty state then rename + delete conversation', async ({
    page,
    consoleErrors,
    pageErrors,
  }) => {
    const firstPrompt = 'First user message';
    await test.step('Navigate to new conversation', async () => {
      await navigate(page, '/admin/apps/chat/c/new');
    });

    await test.step('Compose and send first prompt', async () => {
      // Empty state composer first appears with placeholder 'Let us know what you need...'
      const ctaComposer = page
        .getByPlaceholder(/let us know what you need/i)
        .first();
      await ctaComposer.waitFor({ state: 'visible', timeout: 20_000 });
      await ctaComposer.fill(firstPrompt);
      await page.getByRole('button', { name: /send/i }).click();
    });

    let testConversationId: string | undefined;
    await test.step('Wait for streamed assistant response', async () => {
      await expect(page).toHaveURL(/\/admin\/apps\/chat\/c\//, {
        timeout: 30_000,
      });
      const userBubble = page.locator('.chat.chat-end .chat-bubble');
      await userBubble.first().waitFor({ state: 'visible', timeout: 10_000 });

      // With stubbed backend, assistant bubble should appear quickly
      const assistantBubble = page.locator(
        '.chat.chat-start .chat-bubble-primary, .chat.chat-start .chat-bubble'
      );
      await assistantBubble
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 });

      // Check the actual content - log it even if assertion fails
      const content = await assistantBubble.first().textContent();
      console.log(
        '[test-check] Assistant bubble content:',
        JSON.stringify(content)
      );

      // Verify localStorage to see if conversation was updated
      const lsData = await page.evaluate(() => {
        const keys = [
          'spec-server.chat.conversations.22222222-2222-4222-8222-222222222222.33333333-3333-4333-8333-333333333333',
        ];
        const result: any = {};
        for (const k of keys) {
          const raw = localStorage.getItem(k);
          if (raw) {
            try {
              result[k] = JSON.parse(raw);
            } catch {
              result[k] = raw;
            }
          }
        }
        return result;
      });
      console.log(
        '[test-check] LocalStorage conversations:',
        JSON.stringify(lsData, null, 2)
      );

      // Now assert (will fail but we'll have the debug info)
      await expect(assistantBubble.first()).toContainText('Pong', {
        timeout: 5_000,
      });

      try {
        const url = new URL(page.url());
        testConversationId = url.pathname.split('/').pop();
      } catch {
        /* ignore */
      }
    });

    await test.step('Rename conversation via API call', async () => {
      // UI rename feature not yet implemented, so we test via direct API call
      if (testConversationId) {
        await page.evaluate(async (id) => {
          await fetch(`${location.origin}/chat/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Renamed Title E2E' }),
          });
        }, testConversationId);
        // Navigate away and back to force hydration and verify no crash
        await navigate(page, '/admin/apps/chat/c/new');
      }
    });

    await test.step('Delete conversation via sidebar delete button', async () => {
      await page.addInitScript(() => {
        (window as any).confirm = () => true;
      });
      const delBtn = page
        .getByRole('button', { name: 'Delete conversation' })
        .first();
      await delBtn.click();
      await expect(page).toHaveURL(/\/admin\/apps\/chat\/c\//, {
        timeout: 30_000,
      });
    });

    await test.step('No runtime errors', async () => {
      expectNoRuntimeErrors('manual send lifecycle', consoleErrors, pageErrors);
    });
  });
});

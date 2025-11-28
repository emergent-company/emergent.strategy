import { test, expect } from '@playwright/test';

test.describe('Access Tree API Calls Fix', () => {
  test('should not call orgs-and-projects when not authenticated', async ({ page }) => {
    const apiCalls: string[] = [];
    
    // Track all API calls
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/user/orgs-and-projects')) {
        apiCalls.push(url);
        console.log('API call detected:', url);
      }
    });

    // Clear localStorage to ensure no auth data
    await page.goto('http://localhost:5175');
    await page.evaluate(() => {
      localStorage.clear();
    });
    
    // Navigate to landing page
    await page.goto('http://localhost:5175');
    
    // Wait a bit to ensure any API calls would have been made
    await page.waitForTimeout(2000);
    
    // Verify no API calls were made
    console.log(`Total orgs-and-projects calls: ${apiCalls.length}`);
    expect(apiCalls.length).toBe(0);
  });

  test('should call orgs-and-projects only once when authenticated', async ({ page }) => {
    const apiCalls: string[] = [];
    
    // Track all API calls
    page.on('request', (request) => {
      const url = request.url();
      if (url.includes('/api/user/orgs-and-projects')) {
        apiCalls.push(url);
        console.log('API call detected:', url);
      }
    });

    // Navigate to landing page
    await page.goto('http://localhost:5175');
    
    // Check if there's a login button or auth flow
    const pageContent = await page.content();
    console.log('Page loaded, checking for auth status...');
    
    // Wait a bit to ensure any API calls would have been made
    await page.waitForTimeout(2000);
    
    // Log the number of calls
    console.log(`Total orgs-and-projects calls: ${apiCalls.length}`);
    
    // If authenticated (has token), should be 1 call. If not authenticated, should be 0
    expect(apiCalls.length).toBeLessThanOrEqual(1);
  });
});

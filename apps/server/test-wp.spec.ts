import { describe, it, expect } from 'vitest';
import { createBrowseUrlTool } from './src/modules/chat-sdk/tools/browse-url.tool';

describe('wp.pl test', () => {
  it('should fetch wp.pl', async () => {
    const tool = createBrowseUrlTool();
    const result = await tool.invoke({ url: 'https://wp.pl' });
    console.log('WP.PL RESULT:', result);
    expect(result).toBeDefined();
  }, 60000);
});

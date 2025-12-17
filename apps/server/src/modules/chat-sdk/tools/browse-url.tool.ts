import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

/**
 * Simple in-memory cache for fetched pages
 * Helps avoid redundant requests for the same URL
 */
interface CacheEntry {
  result: string;
  timestamp: number;
}

const pageCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Rate limiter to be polite to servers
 */
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 1000; // 1 second between requests

/**
 * Get cached result if valid
 */
function getCachedResult(url: string): string | null {
  const cacheKey = url.toLowerCase().trim();
  const entry = pageCache.get(cacheKey);

  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.result;
  }

  // Clean up expired entry
  if (entry) {
    pageCache.delete(cacheKey);
  }

  return null;
}

/**
 * Cache a page result
 */
function cacheResult(url: string, result: string): void {
  const cacheKey = url.toLowerCase().trim();
  pageCache.set(cacheKey, {
    result,
    timestamp: Date.now(),
  });

  // Limit cache size to prevent memory bloat
  if (pageCache.size > 50) {
    // Remove oldest entries
    const entries = Array.from(pageCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, 10);
    toRemove.forEach(([key]) => pageCache.delete(key));
  }
}

/**
 * Wait for rate limit if needed
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
    const waitTime = MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastRequestTime = Date.now();
}

/**
 * Normalize URL by adding https:// if no protocol is present
 * This allows users to type URLs like "onet.pl" or "example.com/page"
 * without needing to specify the protocol
 */
function normalizeUrl(url: string): string {
  const trimmed = url.trim();

  // If already has a protocol, return as-is
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
    return trimmed;
  }

  // If starts with //, add https:
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  // Otherwise, add https://
  return `https://${trimmed}`;
}

/**
 * Validate URL and ensure it's safe to fetch
 */
function validateUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);

    // Only allow http and https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS URLs are allowed' };
    }

    // Block localhost and private IPs for security
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') ||
      hostname.endsWith('.local')
    ) {
      return { valid: false, error: 'Local and private URLs are not allowed' };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Configure Turndown for better markdown output
 */
function createTurndownService(): TurndownService {
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '_',
  });

  // Remove script and style tags
  turndown.remove(['script', 'style', 'noscript', 'iframe', 'nav', 'footer']);

  // Handle code blocks better
  turndown.addRule('pre', {
    filter: 'pre',
    replacement: (content, node) => {
      const element = node as HTMLElement;
      const codeElement = element.querySelector('code');
      const language =
        codeElement?.className?.match(/language-(\w+)/)?.[1] || '';
      const code = codeElement?.textContent || element.textContent || content;
      return `\n\`\`\`${language}\n${code.trim()}\n\`\`\`\n`;
    },
  });

  return turndown;
}

/**
 * Truncate content to a reasonable size for LLM consumption
 */
function truncateContent(
  content: string,
  maxLength: number = 15000
): { content: string; truncated: boolean } {
  if (content.length <= maxLength) {
    return { content, truncated: false };
  }

  // Try to truncate at a paragraph boundary
  const truncated = content.substring(0, maxLength);
  const lastParagraph = truncated.lastIndexOf('\n\n');

  if (lastParagraph > maxLength * 0.8) {
    return {
      content:
        truncated.substring(0, lastParagraph) + '\n\n[Content truncated...]',
      truncated: true,
    };
  }

  return {
    content: truncated + '\n\n[Content truncated...]',
    truncated: true,
  };
}

/**
 * Create a LangChain tool for browsing and reading web pages
 *
 * This tool fetches a URL, extracts the main content using Mozilla Readability,
 * and converts it to clean markdown using Turndown.
 *
 * Features:
 * - Content extraction with Mozilla Readability (same as Firefox Reader View)
 * - Clean markdown conversion with Turndown
 * - Built-in caching (10 minute TTL)
 * - Rate limiting (1 second between requests)
 * - Content truncation for LLM context limits
 *
 * @returns LangChain DynamicStructuredTool configured for URL browsing
 */
export function createBrowseUrlTool() {
  return new DynamicStructuredTool({
    name: 'browse_url',
    description: `Fetch and read the content of a specific web page URL.

This tool retrieves a web page, extracts the main article content, and returns it as clean markdown text suitable for reading and analysis.

URL FORMAT: The protocol (https://) is optional. You can use "example.com" or "https://example.com" - the tool will automatically add https:// if not provided.

Use this when:
- The user provides a specific URL they want you to read or analyze
- You need to verify information from a specific source
- You need to read documentation, articles, or blog posts
- Following up on a search result to get the full content

Examples of when to use this tool:
- "Read this article: example.com/article" or "https://example.com/article"
- "What does this page say? docs.example.com/guide"
- "Summarize the content at blog.example.com/post"
- "Check onet.pl" (protocol added automatically)

DO NOT use this for:
- Searching the web (use search_web instead)
- Questions about the user's own project or knowledge base (use search_knowledge_base)
- URLs that require authentication or are behind paywalls

IMPORTANT - Error Handling:
When this tool returns an error, you MUST explain the error to the user in plain language. Use the "userMessage" field from the error response to communicate what went wrong. Common errors include:
- Domain not found: The website address doesn't exist (possibly a typo)
- Connection refused: The server is not responding or is blocking access
- SSL/TLS certificate error: The website's security certificate is invalid
- Request blocked: The website is blocking automated access
- Timeout: The website took too long to respond

Always be helpful and suggest what the user might do (check spelling, try a different URL, etc.)`,

    schema: z.object({
      url: z
        .string()
        .describe(
          'The URL of the web page to fetch and read. Protocol (https://) is optional - you can use "example.com" or "https://example.com"'
        ),
      includeLinks: z
        .boolean()
        .optional()
        .describe(
          'Whether to include links in the markdown output. Default is true.'
        ),
    }) as any,

    func: async (input: any): Promise<string> => {
      const { url: rawUrl, includeLinks = true } = input;

      // Normalize URL (add https:// if no protocol)
      const url = normalizeUrl(rawUrl);

      // Validate URL
      const validation = validateUrl(url);
      if (!validation.valid) {
        return JSON.stringify(
          {
            error: 'Invalid URL',
            message: validation.error,
            url,
          },
          null,
          2
        );
      }

      // Check cache first
      const cachedResult = getCachedResult(url);
      if (cachedResult) {
        const parsed = JSON.parse(cachedResult);
        parsed._cached = true;
        return JSON.stringify(parsed, null, 2);
      }

      try {
        // Wait for rate limit
        await waitForRateLimit();

        // Fetch the page with browser-like headers
        // Using a realistic User-Agent is important as many sites block bot-like UAs
        const response = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
            'Sec-Ch-Ua':
              '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(30000), // 30 second timeout
        });

        if (!response.ok) {
          // Generate user-friendly messages based on HTTP status code
          let errorCode: string;
          let message: string;
          let userMessage: string;

          switch (response.status) {
            case 401:
              errorCode = 'UNAUTHORIZED';
              message = 'Authentication required to access this page';
              userMessage =
                "I can't access this page because it requires you to be logged in. This tool can only read publicly accessible web pages.";
              break;
            case 403:
              errorCode = 'FORBIDDEN';
              message = 'Access to this page is forbidden';
              userMessage =
                "I'm not allowed to access this page. The website is blocking automated requests or the content requires special permissions.";
              break;
            case 404:
              errorCode = 'NOT_FOUND';
              message = 'The page was not found';
              userMessage =
                "This page doesn't exist. The URL might be outdated, the page may have been moved, or there could be a typo in the address.";
              break;
            case 410:
              errorCode = 'GONE';
              message = 'The page has been permanently removed';
              userMessage =
                'This page has been permanently deleted and is no longer available.';
              break;
            case 429:
              errorCode = 'RATE_LIMITED';
              message = 'Too many requests to this website';
              userMessage =
                'The website is limiting how many pages I can read. Please try again in a few minutes, or try a different source.';
              break;
            case 449:
              errorCode = 'BOT_BLOCKED';
              message = 'Request blocked by bot protection';
              userMessage =
                "This website has bot protection that's blocking my access. I can't read this page directly. You might need to visit it manually in your browser.";
              break;
            case 500:
              errorCode = 'SERVER_ERROR';
              message = 'The website is experiencing internal errors';
              userMessage =
                "The website is having technical problems right now. This isn't something I can fix - you might want to try again later.";
              break;
            case 502:
            case 503:
            case 504:
              errorCode = 'SERVICE_UNAVAILABLE';
              message = `Server unavailable (HTTP ${response.status})`;
              userMessage =
                'The website appears to be down or overloaded right now. Try again in a few minutes.';
              break;
            default:
              errorCode = 'HTTP_ERROR';
              message = `HTTP ${response.status}: ${response.statusText}`;
              userMessage = `I couldn't load this page. The website returned an error (HTTP ${response.status}). This might be a temporary issue - try again later.`;
          }

          return JSON.stringify(
            {
              error: errorCode,
              message,
              userMessage,
              url,
              httpStatus: response.status,
            },
            null,
            2
          );
        }

        const contentType = response.headers.get('content-type') || '';
        if (
          !contentType.includes('text/html') &&
          !contentType.includes('application/xhtml')
        ) {
          return JSON.stringify(
            {
              error: 'Unsupported content type',
              message: `Expected HTML but got: ${contentType}`,
              url,
              _instructions: {
                suggestion:
                  'This URL does not return HTML content. It may be a file download, API endpoint, or other non-HTML resource.',
              },
            },
            null,
            2
          );
        }

        const html = await response.text();

        // Parse with JSDOM and extract with Readability
        const dom = new JSDOM(html, { url });
        const reader = new Readability(dom.window.document, {
          charThreshold: 100,
        });
        const article = reader.parse();

        if (!article || !article.content) {
          // Fallback: try to get body content directly
          const body = dom.window.document.body;
          if (body) {
            const turndown = createTurndownService();
            const markdown = turndown.turndown(body.innerHTML);
            const { content, truncated } = truncateContent(markdown);

            const result = {
              url,
              title: dom.window.document.title || 'Untitled',
              content,
              _metadata: {
                extractionMethod: 'fallback',
                truncated,
                characterCount: content.length,
              },
              _instructions: {
                note: 'Could not extract main article content. Showing full page body instead.',
              },
            };

            const resultJson = JSON.stringify(result, null, 2);
            cacheResult(url, resultJson);
            return resultJson;
          }

          return JSON.stringify(
            {
              error: 'Could not extract content',
              message:
                'The page could not be parsed. It may be empty, require JavaScript, or have an unusual structure.',
              url,
            },
            null,
            2
          );
        }

        // Convert to markdown
        const turndown = createTurndownService();

        // Optionally remove links
        if (!includeLinks) {
          turndown.addRule('removeLinks', {
            filter: 'a',
            replacement: (content) => content,
          });
        }

        let markdown = turndown.turndown(article.content);

        // Clean up excessive whitespace
        markdown = markdown
          .replace(/\n{3,}/g, '\n\n')
          .replace(/[ \t]+$/gm, '')
          .trim();

        // Truncate if needed
        const { content, truncated } = truncateContent(markdown);

        const result = {
          url,
          title: article.title || 'Untitled',
          byline: article.byline || undefined,
          siteName: article.siteName || undefined,
          excerpt: article.excerpt || undefined,
          content,
          _metadata: {
            extractionMethod: 'readability',
            truncated,
            characterCount: content.length,
            wordCount: content.split(/\s+/).length,
          },
          _instructions: {
            citation: 'When referencing this content, cite the URL and title',
            reliability:
              'This content was extracted from the web - verify important claims when possible',
          },
        };

        const resultJson = JSON.stringify(result, null, 2);
        cacheResult(url, resultJson);
        return resultJson;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorCause =
          error instanceof Error && error.cause
            ? String(error.cause)
            : undefined;

        // Handle specific error types
        if (
          errorMessage.includes('timeout') ||
          errorMessage.includes('abort')
        ) {
          return JSON.stringify(
            {
              error: 'TIMEOUT',
              message: 'The page took too long to load (>30 seconds)',
              userMessage:
                'The website took too long to respond (more than 30 seconds). It might be overloaded or having problems. You could try again later, or perhaps try a different source.',
              url,
            },
            null,
            2
          );
        }

        if (
          errorMessage.includes('ENOTFOUND') ||
          errorMessage.includes('getaddrinfo') ||
          errorCause?.includes('ENOTFOUND') ||
          errorCause?.includes('getaddrinfo')
        ) {
          // Extract domain from URL for helpful error message
          let domain = 'this website';
          try {
            domain = new URL(url).hostname;
          } catch {
            // ignore
          }

          return JSON.stringify(
            {
              error: 'DOMAIN_NOT_FOUND',
              message:
                'Could not resolve the domain name. Check if the URL is correct.',
              userMessage: `I couldn't find the website "${domain}". The domain doesn't seem to exist - there might be a typo in the URL. Could you double-check the address?`,
              url,
            },
            null,
            2
          );
        }

        if (
          errorMessage.includes('ECONNREFUSED') ||
          errorCause?.includes('ECONNREFUSED')
        ) {
          return JSON.stringify(
            {
              error: 'CONNECTION_REFUSED',
              message:
                'The server refused the connection. The site may be down or blocking requests.',
              userMessage:
                "I couldn't connect to this website. The server refused the connection - it might be down, or it could be blocking automated access. You could try visiting it directly in your browser.",
              url,
            },
            null,
            2
          );
        }

        if (
          errorMessage.includes('CERT') ||
          errorMessage.includes('certificate') ||
          errorCause?.includes('CERT')
        ) {
          return JSON.stringify(
            {
              error: 'SSL_ERROR',
              message: 'Could not establish a secure connection to the server.',
              userMessage:
                "This website has a security certificate problem, so I can't establish a secure connection. This could mean the site's certificate is expired, invalid, or the connection isn't secure.",
              url,
            },
            null,
            2
          );
        }

        // For "fetch failed" errors, try to extract the cause
        const detailedMessage =
          errorMessage === 'fetch failed' && errorCause
            ? `Network error: ${errorCause}`
            : errorMessage;

        return JSON.stringify(
          {
            error: 'FETCH_FAILED',
            message: detailedMessage,
            userMessage:
              "I wasn't able to access this web page. It might be down, blocking automated access, or requiring authentication. You could try visiting it directly in your browser, or try a different source.",
            url,
          },
          null,
          2
        );
      }
    },
  });
}

/**
 * Clear the page cache (useful for testing)
 */
export function clearBrowseUrlCache(): void {
  pageCache.clear();
}

/**
 * Get cache statistics (useful for debugging)
 */
export function getBrowseUrlCacheStats(): {
  size: number;
  oldestEntryAge: number | null;
} {
  if (pageCache.size === 0) {
    return { size: 0, oldestEntryAge: null };
  }

  const now = Date.now();
  let oldestTimestamp = now;

  pageCache.forEach((entry) => {
    if (entry.timestamp < oldestTimestamp) {
      oldestTimestamp = entry.timestamp;
    }
  });

  return {
    size: pageCache.size,
    oldestEntryAge: now - oldestTimestamp,
  };
}

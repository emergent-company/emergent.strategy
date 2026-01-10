import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { icons as lucideIcons } from '@iconify-json/lucide';

/**
 * Get all valid Lucide icon names (icons + aliases)
 */
function getAllIconNames(): string[] {
  const iconNames = Object.keys(lucideIcons.icons);
  const aliasNames = lucideIcons.aliases
    ? Object.keys(lucideIcons.aliases)
    : [];
  return [...iconNames, ...aliasNames];
}

/**
 * Calculate simple similarity score between two strings
 * Uses a combination of substring matching and character overlap
 */
function getSimilarityScore(query: string, iconName: string): number {
  const q = query.toLowerCase();
  const i = iconName.toLowerCase();

  // Exact match
  if (q === i) return 1000;

  // Contains the query as a whole word part
  if (i.includes(q)) return 500 + (q.length / i.length) * 100;

  // Query contains the icon name
  if (q.includes(i)) return 400 + (i.length / q.length) * 100;

  // Check for word-based partial matches (split by -)
  const queryWords = q.split('-');
  const iconWords = i.split('-');

  let wordMatchScore = 0;
  for (const qWord of queryWords) {
    for (const iWord of iconWords) {
      if (iWord.startsWith(qWord)) {
        wordMatchScore += 50 * (qWord.length / iWord.length);
      } else if (iWord.includes(qWord)) {
        wordMatchScore += 25 * (qWord.length / iWord.length);
      }
    }
  }

  if (wordMatchScore > 0) return wordMatchScore;

  // Basic character overlap (Jaccard-like)
  const qChars = new Set(q.split(''));
  const iChars = new Set(i.split(''));
  const intersection = [...qChars].filter((c) => iChars.has(c)).length;
  const union = new Set([...qChars, ...iChars]).size;

  return (intersection / union) * 20;
}

/**
 * Find similar icons based on query
 */
function findSimilarIcons(
  query: string,
  allIcons: string[],
  limit: number
): Array<{ name: string; score: number }> {
  const results = allIcons
    .map((name) => ({
      name,
      score: getSimilarityScore(query, name),
    }))
    .filter((r) => r.score > 5) // Filter out very low scores
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return results;
}

/**
 * Create a LangChain tool for searching and validating Lucide icons
 *
 * This tool helps the Template Studio AI find valid icon names
 * before generating UI config suggestions.
 */
export function createIconSearchTool() {
  const allIcons = getAllIconNames();

  return new DynamicStructuredTool({
    name: 'search_icons',
    description: `Search for valid Lucide icon names to use in UI configurations.

Use this tool BEFORE suggesting update_ui_config changes to ensure the icon name exists.
Icon names use lowercase with hyphens (e.g., "user", "calendar-days", "file-text").

Examples:
- search_icons({ query: "user" }) → finds user-related icons
- search_icons({ query: "calendar" }) → finds calendar-related icons
- search_icons({ query: "gift", validate: true }) → checks if "gift" exists exactly

Always validate icon names before including them in suggestions.`,
    schema: z.object({
      query: z.string(),
      validate: z.boolean().optional(),
      limit: z.number().optional(),
    }) as any,
    func: async (input: any): Promise<string> => {
      const { query, validate = false, limit = 10 } = input;
      const normalizedQuery = query.toLowerCase().trim();

      // Validation mode: check exact match
      if (validate) {
        const exactMatch = allIcons.includes(normalizedQuery);

        if (exactMatch) {
          return JSON.stringify({
            valid: true,
            icon: normalizedQuery,
            message: `"${normalizedQuery}" is a valid Lucide icon.`,
          });
        }

        // Find similar alternatives
        const suggestions = findSimilarIcons(normalizedQuery, allIcons, 5);

        return JSON.stringify({
          valid: false,
          icon: normalizedQuery,
          message: `"${normalizedQuery}" is NOT a valid Lucide icon.`,
          suggestions: suggestions.map((s) => s.name),
          hint:
            suggestions.length > 0
              ? `Try one of these instead: ${suggestions
                  .map((s) => s.name)
                  .join(', ')}`
              : 'No similar icons found. Try a different search term.',
        });
      }

      // Search mode: find matching icons
      const matches = findSimilarIcons(normalizedQuery, allIcons, limit);

      if (matches.length === 0) {
        return JSON.stringify({
          query: normalizedQuery,
          results: [],
          message: `No icons found matching "${normalizedQuery}". Try a different search term.`,
          totalAvailable: allIcons.length,
        });
      }

      return JSON.stringify({
        query: normalizedQuery,
        results: matches.map((m) => m.name),
        message: `Found ${matches.length} icons matching "${normalizedQuery}".`,
        hint: 'Use the first result or pick one that best matches your needs.',
      });
    },
  });
}

/**
 * Common/popular icons that are frequently used
 * Can be included in prompts as suggestions
 */
export const COMMON_ICONS = [
  // People & Identity
  'user',
  'users',
  'user-circle',
  'contact',
  'id-card',

  // Documents & Files
  'file',
  'file-text',
  'folder',
  'files',
  'clipboard',

  // Communication
  'mail',
  'message-square',
  'phone',
  'send',
  'bell',

  // Navigation & Actions
  'home',
  'settings',
  'search',
  'menu',
  'plus',
  'check',
  'x',

  // Business & Commerce
  'briefcase',
  'building',
  'building-2',
  'landmark',
  'credit-card',
  'dollar-sign',
  'shopping-cart',
  'package',

  // Time & Calendar
  'calendar',
  'calendar-days',
  'clock',
  'timer',
  'history',

  // Data & Analytics
  'chart-bar',
  'chart-line',
  'chart-pie',
  'trending-up',
  'activity',

  // Objects & Things
  'box',
  'gift',
  'key',
  'lock',
  'tag',
  'bookmark',
  'star',
  'heart',
  'flag',

  // Technology
  'laptop',
  'smartphone',
  'monitor',
  'server',
  'database',
  'globe',
  'link',
  'code',

  // Nature & Places
  'map',
  'map-pin',
  'compass',
  'sun',
  'cloud',
  'tree',

  // Arrows & Directions
  'arrow-right',
  'arrow-left',
  'arrow-up',
  'arrow-down',
  'chevron-right',
  'chevron-down',

  // Misc
  'info',
  'alert-circle',
  'alert-triangle',
  'help-circle',
  'check-circle',
  'x-circle',
  'sparkles',
  'zap',
  'target',
  'layers',
];

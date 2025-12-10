/**
 * Text Span Verifier
 *
 * Verifies that extracted entity names actually exist in the source text.
 * Similar to LangExtract's text span alignment, but as a warning system
 * rather than a filter.
 *
 * This helps detect potential hallucinations where the LLM extracts
 * entities that don't appear in the original document.
 */

import { Logger } from '@nestjs/common';

const logger = new Logger('TextSpanVerifier');

/**
 * Alignment status for an entity
 */
export enum AlignmentStatus {
  /** Entity name found exactly in source text */
  MATCH_EXACT = 'MATCH_EXACT',
  /** Entity name found with fuzzy matching (>= 75% token overlap) */
  MATCH_FUZZY = 'MATCH_FUZZY',
  /** Entity name not found in source text - potential hallucination */
  NOT_FOUND = 'NOT_FOUND',
}

/**
 * Result of text span verification
 */
export interface TextSpanResult {
  /** The entity name that was searched for */
  entityName: string;
  /** Alignment status */
  status: AlignmentStatus;
  /** Character start position if found */
  charStart?: number;
  /** Character end position if found */
  charEnd?: number;
  /** The actual text that was matched (may differ slightly for fuzzy) */
  matchedText?: string;
  /** Similarity score for fuzzy matches (0.0-1.0) */
  similarity?: number;
}

/**
 * Verification summary for a batch of entities
 */
export interface VerificationSummary {
  /** Total entities verified */
  total: number;
  /** Exact matches found */
  exactMatches: number;
  /** Fuzzy matches found */
  fuzzyMatches: number;
  /** Not found (potential hallucinations) */
  notFound: number;
  /** List of entity names not found */
  notFoundEntities: string[];
  /** Percentage of entities verified (exact + fuzzy) */
  verificationRate: number;
}

/**
 * Simple tokenizer that splits on whitespace and punctuation
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-.,;:!?'"()\[\]{}]+/)
    .filter((t) => t.length > 0);
}

/**
 * Normalize a token for comparison
 */
function normalizeToken(token: string): string {
  return token.toLowerCase().trim();
}

/**
 * Find exact match of entity name in source text (case-insensitive)
 */
function findExactMatch(
  entityName: string,
  sourceText: string
): { start: number; end: number } | null {
  const normalizedEntity = entityName.toLowerCase();
  const normalizedSource = sourceText.toLowerCase();

  const index = normalizedSource.indexOf(normalizedEntity);
  if (index !== -1) {
    return {
      start: index,
      end: index + entityName.length,
    };
  }

  return null;
}

/**
 * Find fuzzy match using token overlap
 * Returns match if >= threshold of tokens match
 */
function findFuzzyMatch(
  entityName: string,
  sourceText: string,
  threshold: number = 0.75
): {
  start: number;
  end: number;
  similarity: number;
  matchedText: string;
} | null {
  const entityTokens = tokenize(entityName);
  if (entityTokens.length === 0) return null;

  const sourceTokens = tokenize(sourceText);

  // Sliding window over source tokens
  for (let i = 0; i <= sourceTokens.length - entityTokens.length; i++) {
    let matches = 0;
    for (let j = 0; j < entityTokens.length; j++) {
      if (
        normalizeToken(sourceTokens[i + j]) === normalizeToken(entityTokens[j])
      ) {
        matches++;
      }
    }

    const similarity = matches / entityTokens.length;
    if (similarity >= threshold) {
      // Reconstruct the matched text from source
      const matchedTokens = sourceTokens.slice(i, i + entityTokens.length);
      const matchedText = matchedTokens.join(' ');

      // Find approximate character position
      // This is a simplification - for exact positions we'd need char intervals
      const searchPattern = matchedTokens[0];
      let charStart = 0;
      let tokensFound = 0;
      for (let k = 0; k < sourceText.length; k++) {
        const remaining = sourceText.slice(k).toLowerCase();
        if (remaining.startsWith(searchPattern.toLowerCase())) {
          tokensFound++;
          if (tokensFound > i) {
            charStart = k;
            break;
          }
        }
      }

      return {
        start: charStart,
        end: charStart + matchedText.length,
        similarity,
        matchedText,
      };
    }
  }

  return null;
}

/**
 * Verify that an entity name exists in the source text
 */
export function verifyEntitySpan(
  entityName: string,
  sourceText: string,
  fuzzyThreshold: number = 0.75
): TextSpanResult {
  // Try exact match first
  const exactMatch = findExactMatch(entityName, sourceText);
  if (exactMatch) {
    return {
      entityName,
      status: AlignmentStatus.MATCH_EXACT,
      charStart: exactMatch.start,
      charEnd: exactMatch.end,
      matchedText: sourceText.slice(exactMatch.start, exactMatch.end),
      similarity: 1.0,
    };
  }

  // Try fuzzy match
  const fuzzyMatch = findFuzzyMatch(entityName, sourceText, fuzzyThreshold);
  if (fuzzyMatch) {
    return {
      entityName,
      status: AlignmentStatus.MATCH_FUZZY,
      charStart: fuzzyMatch.start,
      charEnd: fuzzyMatch.end,
      matchedText: fuzzyMatch.matchedText,
      similarity: fuzzyMatch.similarity,
    };
  }

  // Not found
  return {
    entityName,
    status: AlignmentStatus.NOT_FOUND,
  };
}

/**
 * Verify multiple entities and return summary with warnings
 */
export function verifyEntities(
  entities: { name: string; type: string }[],
  sourceText: string,
  options: {
    fuzzyThreshold?: number;
    logWarnings?: boolean;
  } = {}
): {
  results: (TextSpanResult & { type: string })[];
  summary: VerificationSummary;
} {
  const { fuzzyThreshold = 0.75, logWarnings = true } = options;

  const results: (TextSpanResult & { type: string })[] = [];
  let exactMatches = 0;
  let fuzzyMatches = 0;
  let notFound = 0;
  const notFoundEntities: string[] = [];

  for (const entity of entities) {
    const result = verifyEntitySpan(entity.name, sourceText, fuzzyThreshold);
    results.push({ ...result, type: entity.type });

    switch (result.status) {
      case AlignmentStatus.MATCH_EXACT:
        exactMatches++;
        break;
      case AlignmentStatus.MATCH_FUZZY:
        fuzzyMatches++;
        if (logWarnings) {
          logger.warn(
            `Fuzzy match for "${entity.name}" (${entity.type}): matched "${
              result.matchedText
            }" with ${(result.similarity! * 100).toFixed(0)}% similarity`
          );
        }
        break;
      case AlignmentStatus.NOT_FOUND:
        notFound++;
        notFoundEntities.push(entity.name);
        if (logWarnings) {
          logger.warn(
            `POTENTIAL HALLUCINATION: "${entity.name}" (${entity.type}) not found in source text`
          );
        }
        break;
    }
  }

  const total = entities.length;
  const verificationRate =
    total > 0 ? ((exactMatches + fuzzyMatches) / total) * 100 : 100;

  const summary: VerificationSummary = {
    total,
    exactMatches,
    fuzzyMatches,
    notFound,
    notFoundEntities,
    verificationRate,
  };

  if (logWarnings && notFound > 0) {
    logger.warn(
      `Text span verification: ${exactMatches} exact, ${fuzzyMatches} fuzzy, ${notFound} NOT FOUND (${verificationRate.toFixed(
        1
      )}% verified)`
    );
  }

  return { results, summary };
}

/**
 * Quick check if an entity name exists in text (for filtering)
 */
export function entityExistsInText(
  entityName: string,
  sourceText: string,
  allowFuzzy: boolean = true
): boolean {
  const result = verifyEntitySpan(entityName, sourceText);
  if (result.status === AlignmentStatus.MATCH_EXACT) return true;
  if (allowFuzzy && result.status === AlignmentStatus.MATCH_FUZZY) return true;
  return false;
}

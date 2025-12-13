/**
 * Tier 1: Exact/Fuzzy Match Verification Service
 *
 * Uses Levenshtein distance to verify if extracted text appears in source.
 * This is the cheapest verification method ($0) and is always tried first.
 */

import { Injectable } from '@nestjs/common';
import type { ExactMatchResult, VerificationConfig } from './types';

@Injectable()
export class ExactMatchService {
  /**
   * Calculate Levenshtein distance between two strings
   */
  levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    // Initialize first column
    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
    }

    // Initialize first row
    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }

    return matrix[a.length][b.length];
  }

  /**
   * Calculate Levenshtein similarity ratio (0-1)
   */
  levenshteinSimilarity(a: string, b: string): number {
    if (a.length === 0 && b.length === 0) return 1;
    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) return 1;

    const distance = this.levenshteinDistance(a, b);
    return 1 - distance / maxLength;
  }

  /**
   * Normalize text for comparison
   */
  normalizeText(
    text: string,
    options: { removePunctuation?: boolean } = {}
  ): string {
    let normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');

    if (options.removePunctuation) {
      normalized = normalized.replace(/[^\w\s]/g, '');
    }

    return normalized;
  }

  /**
   * Find the best matching substring in source text
   */
  findBestMatch(
    needle: string,
    haystack: string,
    options: { windowPadding?: number } = {}
  ): { similarity: number; matchedText: string; startIndex: number } {
    const normalizedNeedle = this.normalizeText(needle);
    const normalizedHaystack = this.normalizeText(haystack);

    // Quick exact match check
    if (normalizedHaystack.includes(normalizedNeedle)) {
      const startIndex = normalizedHaystack.indexOf(normalizedNeedle);
      return {
        similarity: 1.0,
        matchedText: haystack.substring(startIndex, startIndex + needle.length),
        startIndex,
      };
    }

    // Sliding window for fuzzy matching
    const padding =
      options.windowPadding ?? Math.ceil(normalizedNeedle.length * 0.2);
    const windowSize = normalizedNeedle.length + padding;

    let bestSimilarity = 0;
    let bestMatch = '';
    let bestStartIndex = -1;

    // Slide window through haystack
    for (
      let i = 0;
      i <= normalizedHaystack.length - normalizedNeedle.length + padding;
      i++
    ) {
      const window = normalizedHaystack.substring(i, i + windowSize);
      const similarity = this.levenshteinSimilarity(
        normalizedNeedle,
        window.trim()
      );

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = haystack.substring(i, i + windowSize).trim();
        bestStartIndex = i;
      }
    }

    return {
      similarity: bestSimilarity,
      matchedText: bestMatch,
      startIndex: bestStartIndex,
    };
  }

  /**
   * Verify text using exact/fuzzy match (Tier 1)
   */
  verifyExactMatch(
    textToVerify: string,
    sourceText: string,
    config: Pick<VerificationConfig, 'exactMatchThreshold'>
  ): ExactMatchResult {
    if (!textToVerify || !sourceText) {
      return {
        found: false,
        similarity: 0,
        passed: false,
      };
    }

    const { similarity, matchedText } = this.findBestMatch(
      textToVerify,
      sourceText
    );

    return {
      found: similarity >= config.exactMatchThreshold,
      similarity,
      matchedText: similarity > 0.5 ? matchedText : undefined,
      passed: similarity >= config.exactMatchThreshold,
    };
  }

  /**
   * Verify entity name using exact/fuzzy match
   */
  verifyEntityName(
    entityName: string,
    sourceText: string,
    config: Pick<VerificationConfig, 'exactMatchThreshold'>
  ): ExactMatchResult {
    return this.verifyExactMatch(entityName, sourceText, config);
  }

  /**
   * Verify property value using exact/fuzzy match
   */
  verifyPropertyValue(
    propertyValue: string,
    sourceText: string,
    config: Pick<VerificationConfig, 'exactMatchThreshold'>
  ): ExactMatchResult {
    return this.verifyExactMatch(propertyValue, sourceText, config);
  }

  /**
   * Check if a date string appears in source (with format flexibility)
   */
  verifyDate(
    dateValue: string,
    sourceText: string,
    config: Pick<VerificationConfig, 'exactMatchThreshold'>
  ): ExactMatchResult {
    // Try direct match first
    const directResult = this.verifyExactMatch(dateValue, sourceText, config);
    if (directResult.passed) return directResult;

    // Try to parse and match common date formats
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) {
      return directResult;
    }

    const formats = [
      // ISO format
      date.toISOString().split('T')[0],
      // US format: Month Day, Year
      date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
      // Short month
      date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
      // Numeric US
      date.toLocaleDateString('en-US'),
      // Numeric EU
      date.toLocaleDateString('en-GB'),
    ];

    let bestResult = directResult;

    for (const format of formats) {
      const result = this.verifyExactMatch(format, sourceText, config);
      if (result.similarity > bestResult.similarity) {
        bestResult = result;
      }
      if (result.passed) return result;
    }

    return bestResult;
  }

  /**
   * Verify a numeric value (with tolerance for formatting differences)
   */
  verifyNumber(
    numberValue: string,
    sourceText: string,
    config: Pick<VerificationConfig, 'exactMatchThreshold'>
  ): ExactMatchResult {
    // Try direct match first
    const directResult = this.verifyExactMatch(numberValue, sourceText, config);
    if (directResult.passed) return directResult;

    // Parse number and try different formats
    const num = parseFloat(numberValue.replace(/[,\s]/g, ''));
    if (isNaN(num)) {
      return directResult;
    }

    const formats = [
      num.toString(),
      num.toLocaleString('en-US'),
      num.toLocaleString('en-GB'),
      num.toFixed(0),
      num.toFixed(2),
    ];

    let bestResult = directResult;

    for (const format of formats) {
      const result = this.verifyExactMatch(format, sourceText, config);
      if (result.similarity > bestResult.similarity) {
        bestResult = result;
      }
      if (result.passed) return result;
    }

    return bestResult;
  }
}

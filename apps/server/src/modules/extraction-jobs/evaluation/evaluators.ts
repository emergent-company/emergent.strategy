/**
 * Evaluation functions for extraction quality assessment.
 *
 * These functions compare extracted entities and relationships against
 * expected (golden) outputs and compute precision, recall, F1, and other metrics.
 */

import {
  ExpectedEntity,
  ExpectedRelationship,
  EntityMatchResult,
  EntityMatchingResult,
  RelationshipMatchResult,
  RelationshipMatchingResult,
  EvaluationScore,
  ExtractionEvaluationResult,
  ExtractionExpectedOutput,
} from './types';

// =============================================================================
// String Similarity Functions
// =============================================================================

/**
 * Calculate Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Calculate similarity score between two strings (0.0 to 1.0).
 * Uses Levenshtein distance normalized by max string length.
 */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (a.length === 0 || b.length === 0) return 0.0;

  const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
  const maxLength = Math.max(a.length, b.length);

  return 1 - distance / maxLength;
}

/**
 * Normalize a string for comparison (lowercase, trim, collapse whitespace).
 */
export function normalizeString(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

// =============================================================================
// Entity Matching
// =============================================================================

/** Default similarity threshold for entity name matching */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.85;

/**
 * Find the best matching extracted entity for an expected entity.
 *
 * @param expected - The expected entity
 * @param extractedEntities - List of extracted entities to search
 * @param similarityThreshold - Minimum similarity score to consider a match
 * @returns The match result
 */
export function findBestEntityMatch(
  expected: ExpectedEntity,
  extractedEntities: Array<{
    name: string;
    type: string;
    description?: string;
    properties?: Record<string, unknown>;
  }>,
  similarityThreshold: number = DEFAULT_SIMILARITY_THRESHOLD
): EntityMatchResult {
  const normalizedExpectedName = normalizeString(expected.name);
  let bestMatch: EntityMatchResult = {
    expected,
    matched: undefined,
    similarity: 0,
    typeMatch: false,
  };

  for (const extracted of extractedEntities) {
    const normalizedExtractedName = normalizeString(extracted.name);
    const similarity = stringSimilarity(
      normalizedExpectedName,
      normalizedExtractedName
    );

    if (
      similarity > bestMatch.similarity &&
      similarity >= similarityThreshold
    ) {
      bestMatch = {
        expected,
        matched: extracted,
        similarity,
        typeMatch:
          normalizeString(expected.type) === normalizeString(extracted.type),
      };
    }
  }

  return bestMatch;
}

/**
 * Match all expected entities against extracted entities.
 * Uses greedy matching - each extracted entity can only be matched once.
 *
 * @param expectedEntities - Expected entities from the dataset
 * @param extractedEntities - Entities extracted by the pipeline
 * @param similarityThreshold - Minimum similarity for a match
 * @returns Complete matching results with precision, recall, F1
 */
export function matchEntities(
  expectedEntities: ExpectedEntity[],
  extractedEntities: Array<{
    name: string;
    type: string;
    description?: string;
    properties?: Record<string, unknown>;
  }>,
  similarityThreshold: number = DEFAULT_SIMILARITY_THRESHOLD
): EntityMatchingResult {
  const matches: EntityMatchResult[] = [];
  const usedExtractedIndices = new Set<number>();

  // For each expected entity, find the best unused match
  for (const expected of expectedEntities) {
    let bestMatch: EntityMatchResult = {
      expected,
      matched: undefined,
      similarity: 0,
      typeMatch: false,
    };
    let bestMatchIndex = -1;

    for (let i = 0; i < extractedEntities.length; i++) {
      if (usedExtractedIndices.has(i)) continue;

      const extracted = extractedEntities[i];
      const similarity = stringSimilarity(
        normalizeString(expected.name),
        normalizeString(extracted.name)
      );

      if (
        similarity > bestMatch.similarity &&
        similarity >= similarityThreshold
      ) {
        bestMatch = {
          expected,
          matched: extracted,
          similarity,
          typeMatch:
            normalizeString(expected.type) === normalizeString(extracted.type),
        };
        bestMatchIndex = i;
      }
    }

    if (bestMatchIndex >= 0) {
      usedExtractedIndices.add(bestMatchIndex);
    }

    matches.push(bestMatch);
  }

  // Calculate metrics
  const matchedCount = matches.filter((m) => m.matched !== undefined).length;
  const typeMatchCount = matches.filter((m) => m.typeMatch).length;

  const precision =
    extractedEntities.length > 0 ? matchedCount / extractedEntities.length : 0;
  const recall =
    expectedEntities.length > 0 ? matchedCount / expectedEntities.length : 0;
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;
  const typeAccuracy = matchedCount > 0 ? typeMatchCount / matchedCount : 0;

  return {
    matches,
    precision,
    recall,
    f1,
    typeAccuracy,
  };
}

// =============================================================================
// Relationship Matching
// =============================================================================

/**
 * Mapping of inverse relationship types.
 * If extracted uses CHILD_OF but expected uses PARENT_OF, we recognize them as equivalent
 * (with swapped source/target).
 */
const INVERSE_RELATIONSHIP_TYPES: Record<string, string> = {
  // Family relationships
  parent_of: 'child_of',
  child_of: 'parent_of',
  // Containment
  contains: 'contained_in',
  contained_in: 'contains',
  // Membership
  belongs_to: 'has',
  has: 'belongs_to',
  member_of: 'has_member',
  has_member: 'member_of',
  // Temporal
  precedes: 'follows',
  follows: 'precedes',
  // Causal
  causes: 'caused_by',
  caused_by: 'causes',
  // Organizational
  supervises: 'supervised_by',
  supervised_by: 'supervises',
  employs: 'employed_by',
  employed_by: 'employs',
  // Location
  located_in: 'contains_location',
  contains_location: 'located_in',
  lives_in: 'inhabited_by',
  inhabited_by: 'lives_in',
  lived_in: 'was_inhabited_by',
  was_inhabited_by: 'lived_in',
};

/**
 * Symmetric relationship types where A--REL-->B is equivalent to B--REL-->A.
 */
const SYMMETRIC_RELATIONSHIP_TYPES = new Set([
  'married_to',
  'sibling_of',
  'related_to',
  'connected_to',
  'associated_with',
  'similar_to',
  'linked_to',
]);

/**
 * Format a relationship for comparison.
 * Uses source_name -> type -> target_name format.
 */
function formatRelationship(rel: {
  source_name: string;
  target_name: string;
  relationship_type: string;
}): string {
  return `${normalizeString(rel.source_name)}--${normalizeString(
    rel.relationship_type
  )}-->${normalizeString(rel.target_name)}`;
}

/**
 * Format an extracted relationship for comparison.
 * Needs to resolve temp_ids to entity names.
 */
function formatExtractedRelationship(
  rel: {
    source_ref: string;
    target_ref: string;
    type: string;
  },
  entityMap: Map<string, string>
): string | null {
  const sourceName = entityMap.get(rel.source_ref);
  const targetName = entityMap.get(rel.target_ref);

  if (!sourceName || !targetName) {
    return null;
  }

  return `${normalizeString(sourceName)}--${normalizeString(
    rel.type
  )}-->${normalizeString(targetName)}`;
}

/**
 * Get the inverse format of a relationship.
 * E.g., "a--parent_of-->b" becomes "b--child_of-->a"
 */
function getInverseRelationshipFormat(formatted: string): string | null {
  const match = formatted.match(/^(.+)--(.+)-->(.+)$/);
  if (!match) return null;

  const [, source, type, target] = match;
  const inverseType = INVERSE_RELATIONSHIP_TYPES[type];

  if (!inverseType) return null;

  return `${target}--${inverseType}-->${source}`;
}

/**
 * Check if two relationship formats match (including inverse matching).
 * Uses fuzzy matching for entity names and checks both direct and inverse relationship types.
 *
 * @param expected - Expected relationship format (source--type-->target)
 * @param extracted - Extracted relationship format
 * @param similarityThreshold - Minimum similarity for name matching (default 0.85)
 * @returns Object with match status and match type
 */
function relationshipsMatch(
  expected: string,
  extracted: string,
  similarityThreshold: number = DEFAULT_SIMILARITY_THRESHOLD
): {
  isMatch: boolean;
  matchType: 'exact' | 'fuzzy' | 'inverse' | 'inverse-fuzzy' | 'none';
} {
  // Parse expected format
  const expectedMatch = expected.match(/^(.+)--(.+)-->(.+)$/);
  const extractedMatch = extracted.match(/^(.+)--(.+)-->(.+)$/);

  if (!expectedMatch || !extractedMatch) {
    return { isMatch: false, matchType: 'none' };
  }

  const [, expSource, expType, expTarget] = expectedMatch;
  const [, extSource, extType, extTarget] = extractedMatch;

  // Check direct match (exact or fuzzy)
  const sourceSimDirect = stringSimilarity(expSource, extSource);
  const targetSimDirect = stringSimilarity(expTarget, extTarget);
  const typeMatchDirect = expType === extType;

  if (
    typeMatchDirect &&
    sourceSimDirect >= similarityThreshold &&
    targetSimDirect >= similarityThreshold
  ) {
    const isExact = sourceSimDirect === 1 && targetSimDirect === 1;
    return { isMatch: true, matchType: isExact ? 'exact' : 'fuzzy' };
  }

  // Check inverse match (e.g., expected PARENT_OF vs extracted CHILD_OF with swapped entities)
  const inverseType = INVERSE_RELATIONSHIP_TYPES[extType];
  if (inverseType && inverseType === expType) {
    // For inverse, extracted source/target are swapped
    const sourceSimInverse = stringSimilarity(expSource, extTarget);
    const targetSimInverse = stringSimilarity(expTarget, extSource);

    if (
      sourceSimInverse >= similarityThreshold &&
      targetSimInverse >= similarityThreshold
    ) {
      const isExact = sourceSimInverse === 1 && targetSimInverse === 1;
      return {
        isMatch: true,
        matchType: isExact ? 'inverse' : 'inverse-fuzzy',
      };
    }
  }

  // Check symmetric relationship (e.g., MARRIED_TO where A--MARRIED_TO-->B equals B--MARRIED_TO-->A)
  if (expType === extType && SYMMETRIC_RELATIONSHIP_TYPES.has(expType)) {
    const sourceSimSwapped = stringSimilarity(expSource, extTarget);
    const targetSimSwapped = stringSimilarity(expTarget, extSource);

    if (
      sourceSimSwapped >= similarityThreshold &&
      targetSimSwapped >= similarityThreshold
    ) {
      const isExact = sourceSimSwapped === 1 && targetSimSwapped === 1;
      return { isMatch: true, matchType: isExact ? 'exact' : 'fuzzy' };
    }
  }

  return { isMatch: false, matchType: 'none' };
}

/**
 * Match all expected relationships against extracted relationships.
 *
 * @param expectedRelationships - Expected relationships from the dataset
 * @param extractedRelationships - Relationships extracted by the pipeline
 * @param extractedEntities - Extracted entities (for resolving temp_ids)
 * @returns Complete matching results with precision, recall, F1
 */
export function matchRelationships(
  expectedRelationships: ExpectedRelationship[],
  extractedRelationships: Array<{
    source_ref: string;
    target_ref: string;
    type: string;
    description?: string;
  }>,
  extractedEntities: Array<{
    temp_id: string;
    name: string;
    type: string;
  }>
): RelationshipMatchingResult {
  // Build entity temp_id -> name map
  const entityMap = new Map<string, string>();
  for (const entity of extractedEntities) {
    entityMap.set(entity.temp_id, entity.name);
  }

  // Format expected relationships
  const expectedFormatted = expectedRelationships.map((rel) => ({
    original: rel,
    formatted: formatRelationship(rel),
  }));

  // Format extracted relationships
  const extractedFormatted = extractedRelationships
    .map((rel) => ({
      original: rel,
      formatted: formatExtractedRelationship(rel, entityMap),
    }))
    .filter((r) => r.formatted !== null) as Array<{
    original: (typeof extractedRelationships)[0];
    formatted: string;
  }>;

  // Match relationships using fuzzy and inverse matching
  const matches: RelationshipMatchResult[] = [];
  const usedExtractedIndices = new Set<number>();

  for (const expected of expectedFormatted) {
    let matched: string | undefined;
    let bestMatchType:
      | 'exact'
      | 'fuzzy'
      | 'inverse'
      | 'inverse-fuzzy'
      | 'none' = 'none';
    let bestMatchIndex = -1;

    // Priority: exact > fuzzy > inverse > inverse-fuzzy
    const matchTypePriority: Record<string, number> = {
      exact: 4,
      fuzzy: 3,
      inverse: 2,
      'inverse-fuzzy': 1,
      none: 0,
    };

    for (let i = 0; i < extractedFormatted.length; i++) {
      if (usedExtractedIndices.has(i)) continue;

      const result = relationshipsMatch(
        expected.formatted,
        extractedFormatted[i].formatted
      );

      if (
        result.isMatch &&
        matchTypePriority[result.matchType] > matchTypePriority[bestMatchType]
      ) {
        matched = extractedFormatted[i].formatted;
        bestMatchType = result.matchType;
        bestMatchIndex = i;

        // Early exit on exact match
        if (result.matchType === 'exact') break;
      }
    }

    if (bestMatchIndex >= 0) {
      usedExtractedIndices.add(bestMatchIndex);
    }

    matches.push({
      expected: expected.formatted,
      matched,
      isMatch: matched !== undefined,
      matchType: bestMatchType,
    });
  }

  // Calculate metrics
  const matchedCount = matches.filter((m) => m.isMatch).length;

  const precision =
    extractedFormatted.length > 0
      ? matchedCount / extractedFormatted.length
      : 0;
  const recall =
    expectedRelationships.length > 0
      ? matchedCount / expectedRelationships.length
      : 0;
  const f1 =
    precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : 0;

  return {
    matches,
    precision,
    recall,
    f1,
  };
}

// =============================================================================
// Full Extraction Evaluation
// =============================================================================

/**
 * Evaluate a complete extraction result against expected output.
 *
 * @param extractedEntities - Entities extracted by the pipeline
 * @param extractedRelationships - Relationships extracted by the pipeline
 * @param expectedOutput - Expected output from the dataset
 * @param similarityThreshold - Minimum similarity for entity matching
 * @returns Complete evaluation result with all scores
 */
export function evaluateExtraction(
  extractedEntities: Array<{
    temp_id: string;
    name: string;
    type: string;
    description?: string;
    properties?: Record<string, unknown>;
  }>,
  extractedRelationships: Array<{
    source_ref: string;
    target_ref: string;
    type: string;
    description?: string;
  }>,
  expectedOutput: ExtractionExpectedOutput,
  similarityThreshold: number = DEFAULT_SIMILARITY_THRESHOLD
): ExtractionEvaluationResult {
  // Match entities
  const entityMatching = matchEntities(
    expectedOutput.entities,
    extractedEntities,
    similarityThreshold
  );

  // Match relationships
  const relationshipMatching = matchRelationships(
    expectedOutput.relationships,
    extractedRelationships,
    extractedEntities
  );

  // Build scores array
  const scores: EvaluationScore[] = [
    {
      name: 'entity_precision',
      value: entityMatching.precision,
      comment: `${entityMatching.matches.filter((m) => m.matched).length}/${
        extractedEntities.length
      } extracted entities matched`,
    },
    {
      name: 'entity_recall',
      value: entityMatching.recall,
      comment: `${entityMatching.matches.filter((m) => m.matched).length}/${
        expectedOutput.entities.length
      } expected entities found`,
    },
    {
      name: 'entity_f1',
      value: entityMatching.f1,
      comment: 'Harmonic mean of precision and recall',
    },
    {
      name: 'type_accuracy',
      value: entityMatching.typeAccuracy,
      comment: `${entityMatching.matches.filter((m) => m.typeMatch).length}/${
        entityMatching.matches.filter((m) => m.matched).length
      } matched entities have correct type`,
    },
    {
      name: 'relationship_precision',
      value: relationshipMatching.precision,
      comment: `${
        relationshipMatching.matches.filter((m) => m.isMatch).length
      }/${extractedRelationships.length} extracted relationships matched`,
    },
    {
      name: 'relationship_recall',
      value: relationshipMatching.recall,
      comment: `${
        relationshipMatching.matches.filter((m) => m.isMatch).length
      }/${expectedOutput.relationships.length} expected relationships found`,
    },
    {
      name: 'relationship_f1',
      value: relationshipMatching.f1,
      comment: 'Harmonic mean of precision and recall',
    },
    {
      name: 'overall_quality',
      value: (entityMatching.f1 + relationshipMatching.f1) / 2,
      comment: 'Average of entity F1 and relationship F1',
    },
  ];

  // Build detailed results
  const matchedEntities = entityMatching.matches
    .filter((m) => m.matched)
    .map((m) => ({
      expected: m.expected.name,
      extracted: m.matched!.name,
      similarity: m.similarity,
    }));

  const missingEntities = entityMatching.matches
    .filter((m) => !m.matched)
    .map((m) => m.expected.name);

  const matchedExtractedNames = new Set(
    matchedEntities.map((m) => m.extracted)
  );
  const extraEntities = extractedEntities
    .filter((e) => !matchedExtractedNames.has(e.name))
    .map((e) => e.name);

  const matchedRelationships = relationshipMatching.matches
    .filter((m) => m.isMatch)
    .map((m) => ({
      expected: m.expected,
      extracted: m.matched!,
    }));

  const missingRelationships = relationshipMatching.matches
    .filter((m) => !m.isMatch)
    .map((m) => m.expected);

  const matchedRelationshipSet = new Set(
    matchedRelationships.map((m) => m.extracted)
  );

  // Build entity map for formatting extra relationships
  const entityMap = new Map<string, string>();
  for (const entity of extractedEntities) {
    entityMap.set(entity.temp_id, entity.name);
  }

  const extraRelationships = extractedRelationships
    .map((rel) => formatExtractedRelationship(rel, entityMap))
    .filter((r): r is string => r !== null && !matchedRelationshipSet.has(r));

  return {
    scores,
    matched_entities: matchedEntities,
    missing_entities: missingEntities,
    extra_entities: extraEntities,
    matched_relationships: matchedRelationships,
    missing_relationships: missingRelationships,
    extra_relationships: extraRelationships,
  };
}

/**
 * Aggregate scores across multiple evaluation results.
 *
 * @param results - Array of evaluation results
 * @returns Aggregated statistics for each score type
 */
export function aggregateScores(
  results: ExtractionEvaluationResult[]
): Record<string, { mean: number; min: number; max: number; stdDev: number }> {
  if (results.length === 0) {
    return {};
  }

  // Collect all score values by name
  const scoresByName: Record<string, number[]> = {};

  for (const result of results) {
    for (const score of result.scores) {
      if (!scoresByName[score.name]) {
        scoresByName[score.name] = [];
      }
      scoresByName[score.name].push(score.value);
    }
  }

  // Calculate statistics for each score
  const aggregated: Record<
    string,
    { mean: number; min: number; max: number; stdDev: number }
  > = {};

  for (const [name, values] of Object.entries(scoresByName)) {
    const n = values.length;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const variance =
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    aggregated[name] = { mean, min, max, stdDev };
  }

  return aggregated;
}

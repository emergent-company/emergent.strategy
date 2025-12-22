/**
 * Unit tests for extraction evaluation functions.
 *
 * Tests string similarity, entity matching, relationship matching,
 * and the full evaluation pipeline.
 */

import {
  stringSimilarity,
  normalizeString,
  findBestEntityMatch,
  matchEntities,
  matchRelationships,
  evaluateExtraction,
  aggregateScores,
  DEFAULT_SIMILARITY_THRESHOLD,
} from '../../../../src/modules/extraction-jobs/evaluation/evaluators';
import type {
  ExpectedEntity,
  ExpectedRelationship,
  ExtractionExpectedOutput,
  ExtractionEvaluationResult,
} from '../../../../src/modules/extraction-jobs/evaluation/types';

describe('Evaluation Functions', () => {
  // ===========================================================================
  // String Similarity Tests
  // ===========================================================================

  describe('stringSimilarity', () => {
    it('should return 1.0 for identical strings', () => {
      expect(stringSimilarity('hello', 'hello')).toBe(1.0);
      expect(stringSimilarity('Naomi', 'Naomi')).toBe(1.0);
    });

    it('should return 1.0 for case-insensitive identical strings', () => {
      expect(stringSimilarity('Hello', 'hello')).toBe(1.0);
      expect(stringSimilarity('NAOMI', 'naomi')).toBe(1.0);
    });

    it('should return 0.0 for empty strings', () => {
      expect(stringSimilarity('', 'hello')).toBe(0.0);
      expect(stringSimilarity('hello', '')).toBe(0.0);
    });

    it('should return high similarity for minor typos', () => {
      const similarity = stringSimilarity('Bethlehem', 'Bethleham');
      expect(similarity).toBeGreaterThan(0.85);
    });

    it('should return lower similarity for more different strings', () => {
      const similarity = stringSimilarity('Ruth', 'Boaz');
      expect(similarity).toBeLessThan(0.5);
    });

    it('should handle strings with different lengths', () => {
      const similarity = stringSimilarity('Sam', 'Samuel');
      expect(similarity).toBeGreaterThan(0.4);
      expect(similarity).toBeLessThan(0.7);
    });
  });

  describe('normalizeString', () => {
    it('should lowercase the string', () => {
      expect(normalizeString('HELLO')).toBe('hello');
    });

    it('should trim whitespace', () => {
      expect(normalizeString('  hello  ')).toBe('hello');
    });

    it('should collapse multiple spaces', () => {
      expect(normalizeString('hello   world')).toBe('hello world');
    });

    it('should handle mixed normalization', () => {
      expect(normalizeString('  HELLO   WORLD  ')).toBe('hello world');
    });
  });

  // ===========================================================================
  // Entity Matching Tests
  // ===========================================================================

  describe('findBestEntityMatch', () => {
    const extractedEntities = [
      { name: 'Naomi', type: 'Person', description: 'Mother-in-law' },
      { name: 'Ruth', type: 'Person', description: 'Moabite woman' },
      { name: 'Bethlehem', type: 'Place', description: 'City in Judah' },
    ];

    it('should find exact match', () => {
      const expected: ExpectedEntity = { name: 'Naomi', type: 'Person' };
      const result = findBestEntityMatch(expected, extractedEntities);

      expect(result.matched).toBeDefined();
      expect(result.matched?.name).toBe('Naomi');
      expect(result.similarity).toBe(1.0);
      expect(result.typeMatch).toBe(true);
    });

    it('should find match with case difference', () => {
      const expected: ExpectedEntity = { name: 'RUTH', type: 'Person' };
      const result = findBestEntityMatch(expected, extractedEntities);

      expect(result.matched).toBeDefined();
      expect(result.matched?.name).toBe('Ruth');
      expect(result.similarity).toBe(1.0);
    });

    it('should return no match when below threshold', () => {
      const expected: ExpectedEntity = { name: 'Boaz', type: 'Person' };
      const result = findBestEntityMatch(expected, extractedEntities);

      expect(result.matched).toBeUndefined();
      expect(result.similarity).toBeLessThan(DEFAULT_SIMILARITY_THRESHOLD);
    });

    it('should detect type mismatch', () => {
      const expected: ExpectedEntity = {
        name: 'Bethlehem',
        type: 'City', // Different from 'Place'
      };
      const result = findBestEntityMatch(expected, extractedEntities);

      expect(result.matched).toBeDefined();
      expect(result.matched?.name).toBe('Bethlehem');
      expect(result.typeMatch).toBe(false);
    });

    it('should find fuzzy match above threshold', () => {
      const expected: ExpectedEntity = {
        name: 'Bethlehm', // Typo
        type: 'Place',
      };
      const result = findBestEntityMatch(expected, extractedEntities, 0.8);

      expect(result.matched).toBeDefined();
      expect(result.matched?.name).toBe('Bethlehem');
      expect(result.similarity).toBeGreaterThan(0.8);
    });
  });

  describe('matchEntities', () => {
    it('should match all entities perfectly', () => {
      const expected: ExpectedEntity[] = [
        { name: 'Naomi', type: 'Person' },
        { name: 'Ruth', type: 'Person' },
      ];
      const extracted = [
        { name: 'Naomi', type: 'Person' },
        { name: 'Ruth', type: 'Person' },
      ];

      const result = matchEntities(expected, extracted);

      expect(result.precision).toBe(1.0);
      expect(result.recall).toBe(1.0);
      expect(result.f1).toBe(1.0);
      expect(result.typeAccuracy).toBe(1.0);
    });

    it('should calculate correct precision when more extracted than expected', () => {
      const expected: ExpectedEntity[] = [{ name: 'Naomi', type: 'Person' }];
      const extracted = [
        { name: 'Naomi', type: 'Person' },
        { name: 'Ruth', type: 'Person' },
        { name: 'Boaz', type: 'Person' },
      ];

      const result = matchEntities(expected, extracted);

      // 1 matched out of 3 extracted
      expect(result.precision).toBeCloseTo(1 / 3, 5);
      // 1 matched out of 1 expected
      expect(result.recall).toBe(1.0);
    });

    it('should calculate correct recall when more expected than extracted', () => {
      const expected: ExpectedEntity[] = [
        { name: 'Naomi', type: 'Person' },
        { name: 'Ruth', type: 'Person' },
        { name: 'Boaz', type: 'Person' },
      ];
      const extracted = [{ name: 'Naomi', type: 'Person' }];

      const result = matchEntities(expected, extracted);

      // 1 matched out of 1 extracted
      expect(result.precision).toBe(1.0);
      // 1 matched out of 3 expected
      expect(result.recall).toBeCloseTo(1 / 3, 5);
    });

    it('should handle empty arrays', () => {
      expect(matchEntities([], []).f1).toBe(0);
      expect(matchEntities([], [{ name: 'X', type: 'Y' }]).precision).toBe(0);
      expect(matchEntities([{ name: 'X', type: 'Y' }], []).recall).toBe(0);
    });

    it('should use greedy matching (each extracted only matched once)', () => {
      const expected: ExpectedEntity[] = [
        { name: 'John', type: 'Person' },
        { name: 'John Smith', type: 'Person' },
      ];
      const extracted = [{ name: 'John', type: 'Person' }];

      const result = matchEntities(expected, extracted);

      // Only 1 match possible (greedy)
      const matchedCount = result.matches.filter(
        (m) => m.matched !== undefined
      ).length;
      expect(matchedCount).toBe(1);
    });

    it('should calculate type accuracy correctly', () => {
      const expected: ExpectedEntity[] = [
        { name: 'Naomi', type: 'Person' },
        { name: 'Ruth', type: 'Woman' }, // Different type
      ];
      const extracted = [
        { name: 'Naomi', type: 'Person' },
        { name: 'Ruth', type: 'Person' },
      ];

      const result = matchEntities(expected, extracted);

      // 1 out of 2 type matches
      expect(result.typeAccuracy).toBe(0.5);
    });
  });

  // ===========================================================================
  // Relationship Matching Tests
  // ===========================================================================

  describe('matchRelationships', () => {
    const extractedEntities = [
      { temp_id: 'entity_1', name: 'Boaz', type: 'Person' },
      { temp_id: 'entity_2', name: 'Ruth', type: 'Person' },
      { temp_id: 'entity_3', name: 'Obed', type: 'Person' },
    ];

    it('should match relationships correctly', () => {
      const expected: ExpectedRelationship[] = [
        {
          source_name: 'Boaz',
          target_name: 'Ruth',
          relationship_type: 'MARRIED_TO',
        },
      ];
      const extracted = [
        { source_ref: 'entity_1', target_ref: 'entity_2', type: 'MARRIED_TO' },
      ];

      const result = matchRelationships(expected, extracted, extractedEntities);

      expect(result.precision).toBe(1.0);
      expect(result.recall).toBe(1.0);
      expect(result.f1).toBe(1.0);
    });

    it('should handle missing relationships', () => {
      const expected: ExpectedRelationship[] = [
        {
          source_name: 'Boaz',
          target_name: 'Ruth',
          relationship_type: 'MARRIED_TO',
        },
        {
          source_name: 'Boaz',
          target_name: 'Obed',
          relationship_type: 'PARENT_OF',
        },
      ];
      const extracted = [
        { source_ref: 'entity_1', target_ref: 'entity_2', type: 'MARRIED_TO' },
      ];

      const result = matchRelationships(expected, extracted, extractedEntities);

      expect(result.recall).toBe(0.5); // 1 out of 2 expected
      expect(result.precision).toBe(1.0); // 1 out of 1 extracted
    });

    it('should handle extra relationships (false positives)', () => {
      const expected: ExpectedRelationship[] = [
        {
          source_name: 'Boaz',
          target_name: 'Ruth',
          relationship_type: 'MARRIED_TO',
        },
      ];
      const extracted = [
        { source_ref: 'entity_1', target_ref: 'entity_2', type: 'MARRIED_TO' },
        { source_ref: 'entity_1', target_ref: 'entity_3', type: 'PARENT_OF' },
        { source_ref: 'entity_2', target_ref: 'entity_3', type: 'PARENT_OF' },
      ];

      const result = matchRelationships(expected, extracted, extractedEntities);

      expect(result.recall).toBe(1.0); // 1 out of 1 expected
      expect(result.precision).toBeCloseTo(1 / 3, 5); // 1 out of 3 extracted
    });

    it('should handle case-insensitive relationship types', () => {
      const expected: ExpectedRelationship[] = [
        {
          source_name: 'BOAZ',
          target_name: 'RUTH',
          relationship_type: 'married_to',
        },
      ];
      const extracted = [
        { source_ref: 'entity_1', target_ref: 'entity_2', type: 'MARRIED_TO' },
      ];

      const result = matchRelationships(expected, extracted, extractedEntities);

      expect(result.f1).toBe(1.0);
    });

    it('should handle unresolvable entity references', () => {
      const expected: ExpectedRelationship[] = [
        {
          source_name: 'Boaz',
          target_name: 'Ruth',
          relationship_type: 'MARRIED_TO',
        },
      ];
      const extracted = [
        {
          source_ref: 'unknown_id',
          target_ref: 'entity_2',
          type: 'MARRIED_TO',
        },
      ];

      const result = matchRelationships(expected, extracted, extractedEntities);

      // No valid extracted relationships (unresolvable reference)
      expect(result.precision).toBe(0);
      expect(result.recall).toBe(0);
    });

    // =========================================================================
    // Inverse Relationship Matching Tests
    // =========================================================================

    describe('inverse relationship matching', () => {
      it('should match parent_of with child_of (inverse)', () => {
        const expected: ExpectedRelationship[] = [
          {
            source_name: 'Boaz',
            target_name: 'Obed',
            relationship_type: 'parent_of',
          },
        ];
        // LLM extracted child_of in opposite direction
        const extracted = [
          { source_ref: 'entity_3', target_ref: 'entity_1', type: 'child_of' },
        ];

        const result = matchRelationships(
          expected,
          extracted,
          extractedEntities
        );

        expect(result.recall).toBe(1.0);
        expect(result.f1).toBe(1.0);
        expect(result.matches[0].matchType).toBe('inverse');
      });

      it('should match child_of with parent_of (inverse)', () => {
        const expected: ExpectedRelationship[] = [
          {
            source_name: 'Obed',
            target_name: 'Boaz',
            relationship_type: 'child_of',
          },
        ];
        // LLM extracted parent_of in opposite direction
        const extracted = [
          { source_ref: 'entity_1', target_ref: 'entity_3', type: 'parent_of' },
        ];

        const result = matchRelationships(
          expected,
          extracted,
          extractedEntities
        );

        expect(result.recall).toBe(1.0);
        expect(result.matches[0].matchType).toBe('inverse');
      });

      it('should match employs with employed_by (inverse)', () => {
        const extractedWithOrg = [
          { temp_id: 'entity_1', name: 'Acme Corp', type: 'Organization' },
          { temp_id: 'entity_2', name: 'John Smith', type: 'Person' },
        ];
        const expected: ExpectedRelationship[] = [
          {
            source_name: 'Acme Corp',
            target_name: 'John Smith',
            relationship_type: 'employs',
          },
        ];
        const extracted = [
          {
            source_ref: 'entity_2',
            target_ref: 'entity_1',
            type: 'employed_by',
          },
        ];

        const result = matchRelationships(
          expected,
          extracted,
          extractedWithOrg
        );

        expect(result.recall).toBe(1.0);
        expect(result.matches[0].matchType).toBe('inverse');
      });

      it('should match contains with contained_in (inverse)', () => {
        const extractedWithPlace = [
          { temp_id: 'entity_1', name: 'Israel', type: 'Country' },
          { temp_id: 'entity_2', name: 'Bethlehem', type: 'City' },
        ];
        const expected: ExpectedRelationship[] = [
          {
            source_name: 'Israel',
            target_name: 'Bethlehem',
            relationship_type: 'contains',
          },
        ];
        const extracted = [
          {
            source_ref: 'entity_2',
            target_ref: 'entity_1',
            type: 'contained_in',
          },
        ];

        const result = matchRelationships(
          expected,
          extracted,
          extractedWithPlace
        );

        expect(result.recall).toBe(1.0);
        expect(result.matches[0].matchType).toBe('inverse');
      });

      it('should match member_of with has_member (inverse)', () => {
        const extractedWithGroup = [
          { temp_id: 'entity_1', name: 'Board of Directors', type: 'Group' },
          { temp_id: 'entity_2', name: 'Jane Doe', type: 'Person' },
        ];
        const expected: ExpectedRelationship[] = [
          {
            source_name: 'Jane Doe',
            target_name: 'Board of Directors',
            relationship_type: 'member_of',
          },
        ];
        const extracted = [
          {
            source_ref: 'entity_1',
            target_ref: 'entity_2',
            type: 'has_member',
          },
        ];

        const result = matchRelationships(
          expected,
          extracted,
          extractedWithGroup
        );

        expect(result.recall).toBe(1.0);
        expect(result.matches[0].matchType).toBe('inverse');
      });

      it('should prefer exact match over inverse match', () => {
        const expected: ExpectedRelationship[] = [
          {
            source_name: 'Boaz',
            target_name: 'Obed',
            relationship_type: 'parent_of',
          },
        ];
        // Both exact and inverse available - should prefer exact
        const extracted = [
          { source_ref: 'entity_1', target_ref: 'entity_3', type: 'parent_of' },
          { source_ref: 'entity_3', target_ref: 'entity_1', type: 'child_of' },
        ];

        const result = matchRelationships(
          expected,
          extracted,
          extractedEntities
        );

        expect(result.matches[0].matchType).toBe('exact');
        expect(result.precision).toBe(0.5); // 1 matched out of 2 extracted
      });
    });

    // =========================================================================
    // Symmetric Relationship Matching Tests
    // =========================================================================

    describe('symmetric relationship matching', () => {
      it('should match married_to regardless of direction', () => {
        const expected: ExpectedRelationship[] = [
          {
            source_name: 'Boaz',
            target_name: 'Ruth',
            relationship_type: 'married_to',
          },
        ];
        // LLM extracted in opposite direction
        const extracted = [
          {
            source_ref: 'entity_2',
            target_ref: 'entity_1',
            type: 'married_to',
          },
        ];

        const result = matchRelationships(
          expected,
          extracted,
          extractedEntities
        );

        expect(result.recall).toBe(1.0);
        expect(result.f1).toBe(1.0);
        // Symmetric matches are treated as 'exact' since they're semantically equivalent
        expect(result.matches[0].matchType).toBe('exact');
      });

      it('should match sibling_of regardless of direction', () => {
        const extractedSiblings = [
          { temp_id: 'entity_1', name: 'Mahlon', type: 'Person' },
          { temp_id: 'entity_2', name: 'Chilion', type: 'Person' },
        ];
        const expected: ExpectedRelationship[] = [
          {
            source_name: 'Mahlon',
            target_name: 'Chilion',
            relationship_type: 'sibling_of',
          },
        ];
        const extracted = [
          {
            source_ref: 'entity_2',
            target_ref: 'entity_1',
            type: 'sibling_of',
          },
        ];

        const result = matchRelationships(
          expected,
          extracted,
          extractedSiblings
        );

        expect(result.recall).toBe(1.0);
        expect(result.matches[0].matchType).toBe('exact');
      });

      it('should match related_to regardless of direction', () => {
        const expected: ExpectedRelationship[] = [
          {
            source_name: 'Boaz',
            target_name: 'Ruth',
            relationship_type: 'related_to',
          },
        ];
        const extracted = [
          {
            source_ref: 'entity_2',
            target_ref: 'entity_1',
            type: 'related_to',
          },
        ];

        const result = matchRelationships(
          expected,
          extracted,
          extractedEntities
        );

        expect(result.recall).toBe(1.0);
        expect(result.matches[0].matchType).toBe('exact');
      });

      it('should not treat non-symmetric relationships as symmetric', () => {
        const expected: ExpectedRelationship[] = [
          {
            source_name: 'Boaz',
            target_name: 'Obed',
            relationship_type: 'parent_of',
          },
        ];
        // Wrong direction without proper inverse type
        const extracted = [
          { source_ref: 'entity_3', target_ref: 'entity_1', type: 'parent_of' },
        ];

        const result = matchRelationships(
          expected,
          extracted,
          extractedEntities
        );

        // Should NOT match (Obed is not parent of Boaz)
        expect(result.recall).toBe(0);
        expect(result.matches[0].matchType).toBe('none');
      });
    });

    // =========================================================================
    // Fuzzy Entity Matching in Relationships Tests
    // =========================================================================

    describe('fuzzy entity matching in relationships', () => {
      it('should match relationships with minor entity name typos', () => {
        // Use longer names (8+ chars) so single-char typo stays above 0.85 threshold
        // Benjamin (8 chars) vs Banjamin = 7/8 = 0.875 similarity
        const extractedWithTypo = [
          { temp_id: 'entity_1', name: 'Jonathan', type: 'Person' },
          { temp_id: 'entity_2', name: 'Banjamin', type: 'Person' }, // Typo: Benjamin -> Banjamin
        ];
        const expected: ExpectedRelationship[] = [
          {
            source_name: 'Jonathan',
            target_name: 'Benjamin',
            relationship_type: 'married_to',
          },
        ];
        const extracted = [
          {
            source_ref: 'entity_1',
            target_ref: 'entity_2',
            type: 'married_to',
          },
        ];

        const result = matchRelationships(
          expected,
          extracted,
          extractedWithTypo
        );

        expect(result.recall).toBe(1.0);
        expect(result.matches[0].matchType).toBe('fuzzy');
      });

      it('should match inverse relationships with fuzzy entity names', () => {
        // Use longer names (8+ chars) so single-char typo stays above 0.85 threshold
        // Nehemiah (8 chars) vs Nehemich = 7/8 = 0.875 similarity
        const extractedWithTypo = [
          { temp_id: 'entity_1', name: 'Jonathan', type: 'Person' },
          { temp_id: 'entity_2', name: 'Nehemich', type: 'Person' }, // Typo: Nehemiah -> Nehemich
        ];
        const expected: ExpectedRelationship[] = [
          {
            source_name: 'Jonathan',
            target_name: 'Nehemiah',
            relationship_type: 'parent_of',
          },
        ];
        // Inverse relationship with typo in name
        const extracted = [
          { source_ref: 'entity_2', target_ref: 'entity_1', type: 'child_of' },
        ];

        const result = matchRelationships(
          expected,
          extracted,
          extractedWithTypo
        );

        expect(result.recall).toBe(1.0);
        expect(result.matches[0].matchType).toBe('inverse-fuzzy');
      });

      it('should not match when entity names are too different', () => {
        const extractedDifferent = [
          { temp_id: 'entity_1', name: 'Boaz', type: 'Person' },
          { temp_id: 'entity_2', name: 'Naomi', type: 'Person' }, // Different person
        ];
        const expected: ExpectedRelationship[] = [
          {
            source_name: 'Boaz',
            target_name: 'Ruth',
            relationship_type: 'married_to',
          },
        ];
        const extracted = [
          {
            source_ref: 'entity_1',
            target_ref: 'entity_2',
            type: 'married_to',
          },
        ];

        const result = matchRelationships(
          expected,
          extracted,
          extractedDifferent
        );

        // Naomi is not similar enough to Ruth
        expect(result.recall).toBe(0);
      });
    });

    // =========================================================================
    // Match Type Priority Tests
    // =========================================================================

    describe('match type priority', () => {
      it('should prioritize exact > fuzzy > inverse > inverse-fuzzy', () => {
        const entities = [
          { temp_id: 'e1', name: 'Alice', type: 'Person' },
          { temp_id: 'e2', name: 'Bob', type: 'Person' },
          { temp_id: 'e3', name: 'Alyce', type: 'Person' }, // Fuzzy match to Alice
        ];

        const expected: ExpectedRelationship[] = [
          {
            source_name: 'Alice',
            target_name: 'Bob',
            relationship_type: 'supervises',
          },
        ];

        // Multiple potential matches with different types
        const extracted = [
          { source_ref: 'e1', target_ref: 'e2', type: 'supervises' }, // Exact
        ];

        const result = matchRelationships(expected, extracted, entities);

        expect(result.matches[0].matchType).toBe('exact');
      });

      it('should pick fuzzy when exact is not available', () => {
        // Use longer names (8+ chars) so single-char typo stays above 0.85 threshold
        // Jeremiah (8 chars) vs Jeremich = 7/8 = 0.875 similarity
        const entities = [
          { temp_id: 'e1', name: 'Jeremich', type: 'Person' }, // Typo: Jeremiah -> Jeremich
          { temp_id: 'e2', name: 'Bob', type: 'Person' },
        ];

        const expected: ExpectedRelationship[] = [
          {
            source_name: 'Jeremiah',
            target_name: 'Bob',
            relationship_type: 'supervises',
          },
        ];

        const extracted = [
          { source_ref: 'e1', target_ref: 'e2', type: 'supervises' },
        ];

        const result = matchRelationships(expected, extracted, entities);

        expect(result.matches[0].matchType).toBe('fuzzy');
      });
    });
  });

  // ===========================================================================
  // Full Evaluation Tests
  // ===========================================================================

  describe('evaluateExtraction', () => {
    it('should return perfect scores for perfect extraction', () => {
      const extracted = [
        { temp_id: 'e1', name: 'Naomi', type: 'Person' },
        { temp_id: 'e2', name: 'Ruth', type: 'Person' },
      ];
      const extractedRels = [
        { source_ref: 'e1', target_ref: 'e2', type: 'MOTHER_IN_LAW_OF' },
      ];
      const expectedOutput: ExtractionExpectedOutput = {
        entities: [
          { name: 'Naomi', type: 'Person' },
          { name: 'Ruth', type: 'Person' },
        ],
        relationships: [
          {
            source_name: 'Naomi',
            target_name: 'Ruth',
            relationship_type: 'MOTHER_IN_LAW_OF',
          },
        ],
      };

      const result = evaluateExtraction(
        extracted,
        extractedRels,
        expectedOutput
      );

      const entityF1 = result.scores.find((s) => s.name === 'entity_f1');
      const relF1 = result.scores.find((s) => s.name === 'relationship_f1');
      const overall = result.scores.find((s) => s.name === 'overall_quality');

      expect(entityF1?.value).toBe(1.0);
      expect(relF1?.value).toBe(1.0);
      expect(overall?.value).toBe(1.0);
    });

    it('should return zero scores for empty extraction', () => {
      const expectedOutput: ExtractionExpectedOutput = {
        entities: [
          { name: 'Naomi', type: 'Person' },
          { name: 'Ruth', type: 'Person' },
        ],
        relationships: [
          {
            source_name: 'Naomi',
            target_name: 'Ruth',
            relationship_type: 'PARENT_OF',
          },
        ],
      };

      const result = evaluateExtraction([], [], expectedOutput);

      const entityRecall = result.scores.find(
        (s) => s.name === 'entity_recall'
      );
      const relRecall = result.scores.find(
        (s) => s.name === 'relationship_recall'
      );

      expect(entityRecall?.value).toBe(0);
      expect(relRecall?.value).toBe(0);
      expect(result.missing_entities).toEqual(['Naomi', 'Ruth']);
    });

    it('should correctly identify extra entities', () => {
      const extracted = [
        { temp_id: 'e1', name: 'Naomi', type: 'Person' },
        { temp_id: 'e2', name: 'Boaz', type: 'Person' }, // Extra
      ];
      const expectedOutput: ExtractionExpectedOutput = {
        entities: [{ name: 'Naomi', type: 'Person' }],
        relationships: [],
      };

      const result = evaluateExtraction(extracted, [], expectedOutput);

      expect(result.extra_entities).toContain('Boaz');
      expect(result.matched_entities).toHaveLength(1);
    });

    it('should correctly identify missing entities', () => {
      const extracted = [{ temp_id: 'e1', name: 'Naomi', type: 'Person' }];
      const expectedOutput: ExtractionExpectedOutput = {
        entities: [
          { name: 'Naomi', type: 'Person' },
          { name: 'Ruth', type: 'Person' },
        ],
        relationships: [],
      };

      const result = evaluateExtraction(extracted, [], expectedOutput);

      expect(result.missing_entities).toContain('Ruth');
      expect(result.matched_entities).toHaveLength(1);
    });

    it('should calculate overall_quality as average of entity_f1 and relationship_f1', () => {
      const extracted = [
        { temp_id: 'e1', name: 'Naomi', type: 'Person' },
        { temp_id: 'e2', name: 'Ruth', type: 'Person' },
      ];
      const expectedOutput: ExtractionExpectedOutput = {
        entities: [
          { name: 'Naomi', type: 'Person' },
          { name: 'Ruth', type: 'Person' },
        ],
        relationships: [
          {
            source_name: 'Naomi',
            target_name: 'Ruth',
            relationship_type: 'PARENT_OF',
          },
        ],
      };

      // No relationships extracted - entity F1 = 1.0, relationship F1 = 0
      const result = evaluateExtraction(extracted, [], expectedOutput);

      const entityF1 = result.scores.find((s) => s.name === 'entity_f1')?.value;
      const relF1 = result.scores.find(
        (s) => s.name === 'relationship_f1'
      )?.value;
      const overall = result.scores.find(
        (s) => s.name === 'overall_quality'
      )?.value;

      expect(entityF1).toBe(1.0);
      expect(relF1).toBe(0);
      expect(overall).toBe(0.5); // Average
    });
  });

  // ===========================================================================
  // Score Aggregation Tests
  // ===========================================================================

  describe('aggregateScores', () => {
    it('should return empty object for empty results', () => {
      const aggregated = aggregateScores([]);
      expect(aggregated).toEqual({});
    });

    it('should calculate correct mean', () => {
      const results: ExtractionEvaluationResult[] = [
        {
          scores: [{ name: 'entity_f1', value: 0.8 }],
          matched_entities: [],
          missing_entities: [],
          extra_entities: [],
          matched_relationships: [],
          missing_relationships: [],
          extra_relationships: [],
        },
        {
          scores: [{ name: 'entity_f1', value: 0.6 }],
          matched_entities: [],
          missing_entities: [],
          extra_entities: [],
          matched_relationships: [],
          missing_relationships: [],
          extra_relationships: [],
        },
      ];

      const aggregated = aggregateScores(results);

      expect(aggregated['entity_f1'].mean).toBe(0.7);
    });

    it('should calculate correct min and max', () => {
      const results: ExtractionEvaluationResult[] = [
        {
          scores: [{ name: 'entity_f1', value: 0.5 }],
          matched_entities: [],
          missing_entities: [],
          extra_entities: [],
          matched_relationships: [],
          missing_relationships: [],
          extra_relationships: [],
        },
        {
          scores: [{ name: 'entity_f1', value: 0.9 }],
          matched_entities: [],
          missing_entities: [],
          extra_entities: [],
          matched_relationships: [],
          missing_relationships: [],
          extra_relationships: [],
        },
        {
          scores: [{ name: 'entity_f1', value: 0.7 }],
          matched_entities: [],
          missing_entities: [],
          extra_entities: [],
          matched_relationships: [],
          missing_relationships: [],
          extra_relationships: [],
        },
      ];

      const aggregated = aggregateScores(results);

      expect(aggregated['entity_f1'].min).toBe(0.5);
      expect(aggregated['entity_f1'].max).toBe(0.9);
    });

    it('should calculate correct standard deviation', () => {
      const results: ExtractionEvaluationResult[] = [
        {
          scores: [{ name: 'entity_f1', value: 0.0 }],
          matched_entities: [],
          missing_entities: [],
          extra_entities: [],
          matched_relationships: [],
          missing_relationships: [],
          extra_relationships: [],
        },
        {
          scores: [{ name: 'entity_f1', value: 1.0 }],
          matched_entities: [],
          missing_entities: [],
          extra_entities: [],
          matched_relationships: [],
          missing_relationships: [],
          extra_relationships: [],
        },
      ];

      const aggregated = aggregateScores(results);

      // Mean = 0.5, variance = ((0-0.5)^2 + (1-0.5)^2) / 2 = 0.25, stdDev = 0.5
      expect(aggregated['entity_f1'].stdDev).toBe(0.5);
    });

    it('should handle multiple score types', () => {
      const results: ExtractionEvaluationResult[] = [
        {
          scores: [
            { name: 'entity_f1', value: 0.8 },
            { name: 'relationship_f1', value: 0.6 },
          ],
          matched_entities: [],
          missing_entities: [],
          extra_entities: [],
          matched_relationships: [],
          missing_relationships: [],
          extra_relationships: [],
        },
      ];

      const aggregated = aggregateScores(results);

      expect(aggregated['entity_f1']).toBeDefined();
      expect(aggregated['relationship_f1']).toBeDefined();
    });
  });
});

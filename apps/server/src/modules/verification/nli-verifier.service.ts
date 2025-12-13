/**
 * Tier 2: NLI (Natural Language Inference) Verification Service
 *
 * Uses a self-hosted DeBERTa-v3-small model to verify semantic entailment.
 * The NLI service determines if a hypothesis (extracted claim) is entailed by,
 * contradicted by, or neutral to a premise (source text).
 */

import { Injectable, Logger } from '@nestjs/common';
import type {
  NLIPrediction,
  NLIVerificationResult,
  VerificationConfig,
} from './types';

@Injectable()
export class NLIVerifierService {
  private readonly logger = new Logger(NLIVerifierService.name);

  /**
   * Check if the NLI service is available
   */
  async checkAvailability(
    config: Pick<VerificationConfig, 'nliEndpoint' | 'nliTimeoutMs'>
  ): Promise<boolean> {
    try {
      const healthUrl = config.nliEndpoint.replace('/predict', '/health');
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        config.nliTimeoutMs
      );

      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) return false;

      const data = await response.json();
      return data.status === 'healthy' && data.model_loaded === true;
    } catch {
      return false;
    }
  }

  /**
   * Call the NLI service to get prediction scores
   */
  async callNLIService(
    premise: string,
    hypothesis: string,
    config: Pick<VerificationConfig, 'nliEndpoint' | 'nliTimeoutMs'>
  ): Promise<NLIPrediction> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.nliTimeoutMs);

    try {
      const response = await fetch(config.nliEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ premise, hypothesis }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `NLI service returned ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();

      return {
        entailment: data.entailment,
        contradiction: data.contradiction,
        neutral: data.neutral,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Call the NLI service with batch predictions
   */
  async callNLIServiceBatch(
    pairs: Array<{ premise: string; hypothesis: string }>,
    config: Pick<VerificationConfig, 'nliEndpoint' | 'nliTimeoutMs'>
  ): Promise<NLIPrediction[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      config.nliTimeoutMs * 2
    );

    try {
      const batchUrl = config.nliEndpoint.replace('/predict', '/predict/batch');
      const response = await fetch(batchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pairs: pairs.map((p) => ({
            premise: p.premise,
            hypothesis: p.hypothesis,
          })),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `NLI batch service returned ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();
      return data.results;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Interpret NLI prediction scores based on configuration thresholds
   */
  interpretPrediction(
    prediction: NLIPrediction,
    config: Pick<
      VerificationConfig,
      | 'nliEntailmentThreshold'
      | 'nliContradictionThreshold'
      | 'nliUncertaintyRange'
    >
  ): { passed: boolean; rejected: boolean; uncertain: boolean } {
    const { entailment, contradiction } = prediction;
    const [uncertainMin, uncertainMax] = config.nliUncertaintyRange;

    // Check for clear entailment
    if (entailment >= config.nliEntailmentThreshold) {
      return { passed: true, rejected: false, uncertain: false };
    }

    // Check for clear contradiction
    if (contradiction >= config.nliContradictionThreshold) {
      return { passed: false, rejected: true, uncertain: false };
    }

    // Check for uncertainty (needs Tier 3)
    if (entailment >= uncertainMin && entailment <= uncertainMax) {
      return { passed: false, rejected: false, uncertain: true };
    }

    // Default: not verified, not contradicted, not uncertain enough for Tier 3
    return { passed: false, rejected: false, uncertain: false };
  }

  /**
   * Verify a claim using NLI (Tier 2)
   */
  async verify(
    premise: string,
    hypothesis: string,
    config: Pick<
      VerificationConfig,
      | 'nliEndpoint'
      | 'nliTimeoutMs'
      | 'nliEntailmentThreshold'
      | 'nliContradictionThreshold'
      | 'nliUncertaintyRange'
    >
  ): Promise<NLIVerificationResult> {
    try {
      const prediction = await this.callNLIService(premise, hypothesis, config);
      const interpretation = this.interpretPrediction(prediction, config);

      return {
        prediction,
        ...interpretation,
        available: true,
      };
    } catch (error) {
      this.logger.warn(
        `NLI verification failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
      return {
        prediction: { entailment: 0, contradiction: 0, neutral: 0 },
        passed: false,
        rejected: false,
        uncertain: true, // Treat service failure as uncertain
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create a hypothesis for entity verification
   */
  createEntityHypothesis(entityName: string, entityType?: string): string {
    if (entityType) {
      return `"${entityName}" is a ${entityType} mentioned in the text.`;
    }
    return `"${entityName}" is mentioned in the text.`;
  }

  /**
   * Create a hypothesis for property verification
   */
  createPropertyHypothesis(
    entityName: string,
    propertyName: string,
    propertyValue: string
  ): string {
    const normalizedPropName = propertyName.toLowerCase().replace(/_/g, ' ');

    switch (normalizedPropName) {
      case 'title':
      case 'job title':
      case 'position':
        return `${entityName}'s title or position is "${propertyValue}".`;
      case 'date':
      case 'start date':
      case 'end date':
        return `The date associated with ${entityName} is ${propertyValue}.`;
      case 'location':
      case 'place':
        return `${entityName} is located at or associated with "${propertyValue}".`;
      case 'email':
        return `${entityName}'s email address is ${propertyValue}.`;
      case 'phone':
      case 'phone number':
        return `${entityName}'s phone number is ${propertyValue}.`;
      case 'description':
      case 'summary':
        return `${entityName} is described as "${propertyValue}".`;
      default:
        return `${entityName} has ${normalizedPropName} equal to "${propertyValue}".`;
    }
  }

  /**
   * Truncate premise to avoid exceeding token limits
   * NLI models typically have 512 token limit
   */
  truncatePremise(text: string, maxChars: number = 2000): string {
    if (text.length <= maxChars) return text;

    const truncated = text.substring(0, maxChars);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');

    const breakPoint = Math.max(lastPeriod, lastNewline);
    if (breakPoint > maxChars * 0.5) {
      return truncated.substring(0, breakPoint + 1);
    }

    return truncated + '...';
  }

  /**
   * Extract relevant sentences from source text for a given entity/claim
   */
  extractRelevantContext(
    sourceText: string,
    searchTerms: string[],
    maxSentences: number = 5
  ): string {
    // Split into sentences
    const sentences = sourceText
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.trim().length > 0);

    // Score each sentence by how many search terms it contains
    const scoredSentences = sentences.map((sentence) => {
      const lowerSentence = sentence.toLowerCase();
      const score = searchTerms.reduce((acc, term) => {
        const lowerTerm = term.toLowerCase();
        return acc + (lowerSentence.includes(lowerTerm) ? 1 : 0);
      }, 0);
      return { sentence, score };
    });

    // Sort by score and take top sentences
    const relevantSentences = scoredSentences
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSentences)
      .map((s) => s.sentence);

    // If no relevant sentences found, return truncated original
    if (relevantSentences.length === 0) {
      return this.truncatePremise(sourceText, 500);
    }

    return relevantSentences.join(' ');
  }

  /**
   * Extract search terms from an entity name and optional property
   */
  extractSearchTerms(entityName: string, propertyValue?: string): string[] {
    const terms: string[] = [];

    // Split entity name into words (handle multi-word names)
    const entityWords = entityName.split(/\s+/).filter((w) => w.length > 2);
    terms.push(...entityWords);

    // Add property value words if provided
    if (propertyValue) {
      const propWords = propertyValue.split(/\s+/).filter((w) => w.length > 2);
      terms.push(...propWords);
    }

    return [...new Set(terms)];
  }

  /**
   * Verify entity with NLI
   */
  async verifyEntity(
    entityName: string,
    entityType: string | undefined,
    sourceText: string,
    config: Pick<
      VerificationConfig,
      | 'nliEndpoint'
      | 'nliTimeoutMs'
      | 'nliEntailmentThreshold'
      | 'nliContradictionThreshold'
      | 'nliUncertaintyRange'
    >
  ): Promise<NLIVerificationResult> {
    const searchTerms = this.extractSearchTerms(entityName);
    const relevantContext = this.extractRelevantContext(
      sourceText,
      searchTerms
    );
    const premise = this.truncatePremise(relevantContext);
    const hypothesis = this.createEntityHypothesis(entityName, entityType);

    return this.verify(premise, hypothesis, config);
  }

  /**
   * Verify property with NLI
   */
  async verifyProperty(
    entityName: string,
    propertyName: string,
    propertyValue: string,
    sourceText: string,
    config: Pick<
      VerificationConfig,
      | 'nliEndpoint'
      | 'nliTimeoutMs'
      | 'nliEntailmentThreshold'
      | 'nliContradictionThreshold'
      | 'nliUncertaintyRange'
    >
  ): Promise<NLIVerificationResult> {
    const searchTerms = this.extractSearchTerms(entityName, propertyValue);
    const relevantContext = this.extractRelevantContext(
      sourceText,
      searchTerms
    );
    const premise = this.truncatePremise(relevantContext);
    const hypothesis = this.createPropertyHypothesis(
      entityName,
      propertyName,
      propertyValue
    );

    return this.verify(premise, hypothesis, config);
  }

  /**
   * Verify a description against source text using NLI.
   * The description becomes the hypothesis to check against the source text (premise).
   */
  async verifyDescription(
    description: string,
    sourceText: string,
    config: Pick<
      VerificationConfig,
      | 'nliEndpoint'
      | 'nliTimeoutMs'
      | 'nliEntailmentThreshold'
      | 'nliContradictionThreshold'
      | 'nliUncertaintyRange'
    >
  ): Promise<NLIVerificationResult> {
    // Extract key terms from description to find relevant context
    const searchTerms = description
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 10);
    const relevantContext = this.extractRelevantContext(
      sourceText,
      searchTerms,
      10 // Use more sentences for description verification
    );
    const premise = this.truncatePremise(relevantContext, 3000);

    // The description itself is the hypothesis
    return this.verify(premise, description, config);
  }

  /**
   * Verify a general hypothesis against source text using NLI.
   * Used for relationship verification and custom claims.
   */
  async verifyHypothesis(
    hypothesis: string,
    sourceText: string,
    config: Pick<
      VerificationConfig,
      | 'nliEndpoint'
      | 'nliTimeoutMs'
      | 'nliEntailmentThreshold'
      | 'nliContradictionThreshold'
      | 'nliUncertaintyRange'
    >
  ): Promise<NLIVerificationResult> {
    // Extract key terms from hypothesis to find relevant context
    const searchTerms = hypothesis
      .split(/\s+/)
      .filter((w) => w.length > 2 && !/^(is|are|the|and|or|a|an)$/i.test(w))
      .slice(0, 10);
    const relevantContext = this.extractRelevantContext(
      sourceText,
      searchTerms,
      8
    );
    const premise = this.truncatePremise(relevantContext, 2500);

    return this.verify(premise, hypothesis, config);
  }
}

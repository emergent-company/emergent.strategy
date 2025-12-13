import { Module } from '@nestjs/common';
import { AppConfigModule } from '../../common/config/config.module';
import { ExactMatchService } from './exact-match.service';
import { NLIVerifierService } from './nli-verifier.service';
import { LLMJudgeService } from './llm-judge.service';
import { VerificationService } from './verification.service';

/**
 * Verification Module
 *
 * Provides a 3-tier extraction verification cascade:
 * - Tier 1: Exact/Fuzzy Match (Levenshtein) - Fast, cheap, always available
 * - Tier 2: NLI Entailment (DeBERTa) - Semantic verification via self-hosted model
 * - Tier 3: LLM Judge (Gemini) - Final arbiter for uncertain cases
 *
 * The cascade stops as soon as a tier produces a confident result, optimizing
 * for cost and speed while maintaining verification accuracy.
 *
 * Components:
 * - ExactMatchService: Levenshtein distance-based text matching
 * - NLIVerifierService: Natural Language Inference using self-hosted DeBERTa
 * - LLMJudgeService: Gemini-based final verification for uncertain cases
 * - VerificationService: Main cascade orchestrator
 */
@Module({
  imports: [AppConfigModule],
  providers: [
    ExactMatchService,
    NLIVerifierService,
    LLMJudgeService,
    VerificationService,
  ],
  exports: [
    VerificationService,
    ExactMatchService,
    NLIVerifierService,
    LLMJudgeService,
  ],
})
export class VerificationModule {}

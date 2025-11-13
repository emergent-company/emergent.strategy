/**
 * LLM Pricing Configuration
 *
 * Pricing data for Google Cloud Vertex AI models as of October 2025.
 * Update this file monthly when Google updates pricing.
 *
 * Source: https://cloud.google.com/vertex-ai/generative-ai/pricing
 */

export interface ModelPricing {
  input_per_1k_tokens: number; // USD per 1,000 input tokens
  output_per_1k_tokens: number; // USD per 1,000 output tokens
  currency: string;
}

/**
 * Pricing table for Vertex AI models
 * All prices in USD
 */
export const LLM_PRICING: Record<string, ModelPricing> = {
  // Gemini 1.5 Pro - High performance, complex tasks
  'gemini-1.5-pro': {
    input_per_1k_tokens: 0.00125, // $1.25 per 1M tokens
    output_per_1k_tokens: 0.005, // $5.00 per 1M tokens
    currency: 'USD',
  },
  'gemini-1.5-pro-001': {
    input_per_1k_tokens: 0.00125,
    output_per_1k_tokens: 0.005,
    currency: 'USD',
  },
  'gemini-1.5-pro-002': {
    input_per_1k_tokens: 0.00125,
    output_per_1k_tokens: 0.005,
    currency: 'USD',
  },

  // Gemini 1.5 Flash - Fast, cost-effective
  'gemini-1.5-flash': {
    input_per_1k_tokens: 0.000075, // $0.075 per 1M tokens
    output_per_1k_tokens: 0.0003, // $0.30 per 1M tokens
    currency: 'USD',
  },
  'gemini-1.5-flash-001': {
    input_per_1k_tokens: 0.000075,
    output_per_1k_tokens: 0.0003,
    currency: 'USD',
  },
  'gemini-1.5-flash-002': {
    input_per_1k_tokens: 0.000075,
    output_per_1k_tokens: 0.0003,
    currency: 'USD',
  },

  // Gemini 1.0 Pro (legacy)
  'gemini-1.0-pro': {
    input_per_1k_tokens: 0.000125, // $0.125 per 1M tokens
    output_per_1k_tokens: 0.000375, // $0.375 per 1M tokens
    currency: 'USD',
  },
};

/**
 * Calculate cost for an LLM call
 *
 * @param modelName - Name of the LLM model (e.g., 'gemini-1.5-pro')
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Calculated cost in USD, or 0 if model not found
 */
export function calculateLLMCost(
  modelName: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = LLM_PRICING[modelName];

  if (!pricing) {
    console.warn(
      `[LLM Pricing] No pricing info for model: ${modelName}. Cost will be 0.`
    );
    return 0;
  }

  const inputCost = (inputTokens / 1000) * pricing.input_per_1k_tokens;
  const outputCost = (outputTokens / 1000) * pricing.output_per_1k_tokens;

  return inputCost + outputCost;
}

/**
 * Get pricing info for a model
 *
 * @param modelName - Name of the LLM model
 * @returns Pricing info or null if not found
 */
export function getModelPricing(modelName: string): ModelPricing | null {
  return LLM_PRICING[modelName] || null;
}

/**
 * List all supported models
 */
export function getSupportedModels(): string[] {
  return Object.keys(LLM_PRICING);
}

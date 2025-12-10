/**
 * Shared model initialization for extraction tests
 */

import { ChatVertexAI } from '@langchain/google-vertexai';
import { CONFIG } from './config.js';

export interface ModelOptions {
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: 'application/json' | 'text/plain';
}

/**
 * Create a ChatVertexAI model instance with default config
 */
export function createModel(options: ModelOptions = {}): ChatVertexAI {
  const {
    temperature = CONFIG.temperature,
    maxOutputTokens = CONFIG.maxOutputTokens,
    responseMimeType = 'application/json',
  } = options;

  return new ChatVertexAI({
    model: CONFIG.model,
    authOptions: { projectId: CONFIG.projectId },
    location: CONFIG.location,
    temperature,
    maxOutputTokens,
    responseMimeType,
  } as any);
}

/**
 * Create a model configured for JSON responses
 */
export function createJsonModel(
  options: Omit<ModelOptions, 'responseMimeType'> = {}
): ChatVertexAI {
  return createModel({ ...options, responseMimeType: 'application/json' });
}

/**
 * Create a model configured for plain text responses
 */
export function createTextModel(
  options: Omit<ModelOptions, 'responseMimeType'> = {}
): ChatVertexAI {
  return createModel({ ...options, responseMimeType: 'text/plain' });
}

/**
 * Execute a model request with timeout
 */
export async function invokeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = CONFIG.defaultTimeoutMs
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timeout after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}

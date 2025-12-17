/**
 * Types for merge chat functionality
 *
 * The merge chat allows interactive AI-assisted merging of two graph objects.
 * Similar to object refinement chat but focused on merge suggestions.
 */

import type { SuggestionStatus } from './object-refinement';

export type MergeSuggestionType =
  | 'property_merge' // Suggest how to merge a specific property
  | 'keep_source' // Keep the source object's value
  | 'keep_target' // Keep the target object's value
  | 'combine' // Combine values from both
  | 'new_value' // Suggest a new value
  | 'drop_property'; // Don't include this property

/**
 * A merge suggestion from the AI assistant
 */
export interface MergeChatSuggestion {
  index: number;
  type: MergeSuggestionType;
  propertyKey: string;
  explanation: string;
  sourceValue: unknown;
  targetValue: unknown;
  suggestedValue: unknown;
  status: SuggestionStatus;
}

/**
 * A message in the merge chat
 */
export interface MergeChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  userId?: string;
  userName?: string;
  suggestions?: MergeChatSuggestion[];
  createdAt: string; // ISO
}

/**
 * A merge chat conversation for a task
 */
export interface MergeChatConversation {
  id: string;
  taskId: string;
  sourceObjectId: string;
  targetObjectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

/**
 * SSE stream event types for merge chat
 */
export type MergeChatStreamEventType =
  | 'meta'
  | 'token'
  | 'suggestions'
  | 'error'
  | 'done';

export interface MergeChatStreamMetaEvent {
  type: 'meta';
  conversationId: string;
  taskId: string;
  generation_error?: string;
  generation_disabled?: boolean;
}

export interface MergeChatStreamTokenEvent {
  type: 'token';
  token: string;
}

export interface MergeChatStreamSuggestionsEvent {
  type: 'suggestions';
  suggestions: Array<{
    type: MergeSuggestionType;
    propertyKey: string;
    explanation: string;
    sourceValue: unknown;
    targetValue: unknown;
    suggestedValue: unknown;
  }>;
}

export interface MergeChatStreamErrorEvent {
  type: 'error';
  error: string;
}

export interface MergeChatStreamDoneEvent {
  type: 'done';
}

export type MergeChatStreamEvent =
  | MergeChatStreamMetaEvent
  | MergeChatStreamTokenEvent
  | MergeChatStreamSuggestionsEvent
  | MergeChatStreamErrorEvent
  | MergeChatStreamDoneEvent;

/**
 * Result of applying a merge suggestion
 */
export interface ApplyMergeSuggestionResult {
  success: boolean;
  error?: string;
  /** Updated suggested properties after applying */
  updatedProperties?: Record<string, unknown>;
}

/**
 * The current merge preview state
 */
export interface MergePreview {
  /** The suggested merged properties */
  suggestedProperties: Record<string, unknown>;
  /** Per-property decisions */
  propertyDecisions: Map<string, MergeChatSuggestion>;
}

/**
 * State for the merge chat hook
 */
export interface UseMergeChatState {
  conversation: MergeChatConversation | null;
  messages: MergeChatMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  /** Current merge preview based on applied suggestions */
  mergePreview: MergePreview | null;
}

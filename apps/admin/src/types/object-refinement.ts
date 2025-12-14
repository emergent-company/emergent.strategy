/**
 * Types for object refinement chat functionality
 */

export type RefinementSuggestionType =
  | 'property_change'
  | 'relationship_add'
  | 'relationship_remove'
  | 'rename';

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'outdated';

/**
 * A refinement suggestion from the AI assistant
 */
export interface RefinementSuggestion {
  index: number;
  type: RefinementSuggestionType;
  explanation: string;
  details: Record<string, unknown>;
  status: SuggestionStatus;
}

export interface PropertyChangeDetails {
  propertyKey: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface RelationshipAddDetails {
  relationshipType: string;
  targetObjectId: string;
  targetObjectName?: string;
  properties?: Record<string, unknown>;
}

export interface RelationshipRemoveDetails {
  relationshipId: string;
  relationshipType: string;
}

export interface RenameDetails {
  oldName: string;
  newName: string;
}

/**
 * A message in the refinement chat
 */
export interface RefinementMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  userId?: string;
  userName?: string;
  suggestions?: RefinementSuggestion[];
  createdAt: string; // ISO
}

/**
 * A refinement conversation for an object
 */
export interface RefinementConversation {
  id: string;
  objectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

/**
 * SSE stream event types
 */
export type RefinementStreamEventType =
  | 'meta'
  | 'token'
  | 'suggestions'
  | 'error'
  | 'done';

export interface RefinementStreamMetaEvent {
  type: 'meta';
  conversationId: string;
  objectId: string;
  objectVersion: number;
  generation_error?: string;
  generation_disabled?: boolean;
}

export interface RefinementStreamTokenEvent {
  type: 'token';
  token: string;
}

export interface RefinementStreamSuggestionsEvent {
  type: 'suggestions';
  suggestions: Array<{
    type: RefinementSuggestionType;
    explanation: string;
    [key: string]: unknown;
  }>;
}

export interface RefinementStreamErrorEvent {
  type: 'error';
  error: string;
}

export interface RefinementStreamDoneEvent {
  type: 'done';
}

export type RefinementStreamEvent =
  | RefinementStreamMetaEvent
  | RefinementStreamTokenEvent
  | RefinementStreamSuggestionsEvent
  | RefinementStreamErrorEvent
  | RefinementStreamDoneEvent;

/**
 * Result of applying a suggestion
 */
export interface ApplySuggestionResult {
  success: boolean;
  error?: string;
  newVersion?: number;
  affectedId?: string;
}

/**
 * State for the object refinement chat hook
 */
export interface UseObjectRefinementChatState {
  conversation: RefinementConversation | null;
  messages: RefinementMessage[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  objectVersion: number | null;
}

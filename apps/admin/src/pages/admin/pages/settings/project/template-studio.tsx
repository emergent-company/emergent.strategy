// Page: Template Pack Studio
// Route: /admin/settings/project/template-studio

import { useEffect, useState, useCallback, useRef, FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useConfig } from '@/contexts/config';
import { Icon } from '@/components/atoms/Icon';
import { Tooltip } from '@/components/atoms/Tooltip';
import { Modal } from '@/components/organisms/Modal/Modal';
import { FormField } from '@/components/molecules/FormField/FormField';
import { SplitPanelLayout } from '@/components/layouts';
import {
  ChatInput,
  KeyboardShortcutsModal,
  SuggestionCard,
  stripSuggestionsFromContent,
  formatTimestamp,
  type UnifiedSuggestion,
} from '@/components/chat';
import {
  useTemplateStudioChat,
  type StudioMessage,
  type SchemaSuggestion,
  type TemplatePack,
} from '@/hooks/use-template-studio-chat';

// ============================================================================
// Adapter: Convert SchemaSuggestion to UnifiedSuggestion
// ============================================================================

function convertToUnifiedSuggestion(
  suggestion: SchemaSuggestion
): UnifiedSuggestion {
  return {
    id: suggestion.id,
    type: suggestion.type,
    description: suggestion.description,
    status: suggestion.status,
    target_type: suggestion.target_type,
    before: suggestion.before,
    after: suggestion.after,
  };
}

// ============================================================================
// Types for Relationship Display
// ============================================================================

interface RelationshipInfo {
  type: string;
  description?: string;
  label?: string;
  inverseLabel?: string;
  sourceTypes: string[];
  targetTypes: string[];
  multiplicity?: { src?: string; dst?: string };
}

interface RelationshipsByObjectType {
  [typeName: string]: {
    outgoing: RelationshipInfo[];
    incoming: RelationshipInfo[];
  };
}

// ============================================================================
// Helper: Compute relationships grouped by object type
// ============================================================================

function computeRelationshipsByObjectType(
  relationshipSchemas: Record<string, unknown>
): RelationshipsByObjectType {
  const result: RelationshipsByObjectType = {};

  for (const [relType, schema] of Object.entries(relationshipSchemas)) {
    const relSchema = schema as Record<string, unknown>;

    // Support multiple schema formats:
    // - Template Studio internal: source_types, target_types
    // - TOGAF pack format: allowedSrcTypes, allowedDstTypes
    // - AI-generated format: fromTypes, toTypes
    const sourceTypes = (relSchema.source_types ||
      relSchema.allowedSrcTypes ||
      relSchema.fromTypes ||
      []) as string[];
    const targetTypes = (relSchema.target_types ||
      relSchema.allowedDstTypes ||
      relSchema.toTypes ||
      []) as string[];

    const relInfo: RelationshipInfo = {
      type: relType,
      description: relSchema.description as string | undefined,
      label: relSchema.label as string | undefined,
      inverseLabel: (relSchema.inverse_label || relSchema.inverseLabel) as
        | string
        | undefined,
      sourceTypes,
      targetTypes,
      multiplicity: relSchema.multiplicity as
        | { src?: string; dst?: string }
        | undefined,
    };

    // Add as outgoing relationship for each source type
    for (const srcType of sourceTypes) {
      if (!result[srcType]) {
        result[srcType] = { outgoing: [], incoming: [] };
      }
      result[srcType].outgoing.push(relInfo);
    }

    // Add as incoming relationship for each target type
    for (const tgtType of targetTypes) {
      if (!result[tgtType]) {
        result[tgtType] = { outgoing: [], incoming: [] };
      }
      // Avoid duplicates if source and target overlap
      if (!sourceTypes.includes(tgtType)) {
        result[tgtType].incoming.push(relInfo);
      }
    }
  }

  return result;
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function TemplatePackStudioPage() {
  const { config } = useConfig();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // URL params
  const sessionIdParam = searchParams.get('session');
  const sourcePackIdParam = searchParams.get('source');
  const nameParam = searchParams.get('name');

  // Save dialog state
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDescription, setSaveDescription] = useState('');
  const [saveVersion, setSaveVersion] = useState('1.0.0');
  const [saveLoading, setSaveLoading] = useState(false);

  // Discard confirmation state
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Keyboard shortcuts modal state
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);

  const {
    session,
    messages,
    isLoading,
    isStreaming,
    error,
    createSession,
    send,
    stop,
    applySuggestion,
    rejectSuggestion,
    savePack,
    discardSession,
  } = useTemplateStudioChat({
    sessionId: sessionIdParam || undefined,
    sourcePackId: sourcePackIdParam || undefined,
    initialName: nameParam || undefined,
    onPackUpdated: (pack) => {
      console.log('[TemplateStudio] Pack updated:', pack.name);
    },
    onSaved: (pack) => {
      console.log('[TemplateStudio] Pack saved:', pack.name);
      navigate('/admin/settings/project/templates');
    },
    onSessionCreated: (newSession) => {
      // Update URL with session ID for persistence across page refresh
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('session', newSession.id);
          // Remove source param since session is now created
          next.delete('source');
          return next;
        },
        { replace: true }
      );
    },
  });

  // Auto-create session if no session exists
  useEffect(() => {
    if (!session && !isLoading && config.activeProjectId) {
      if (sessionIdParam || sourcePackIdParam) {
        // Will be handled by hook
        return;
      }
      // Create new session
      createSession({
        name: nameParam || 'New Template Pack',
      });
    }
  }, [
    session,
    isLoading,
    config.activeProjectId,
    sessionIdParam,
    sourcePackIdParam,
    nameParam,
    createSession,
  ]);

  // Populate save dialog from session
  useEffect(() => {
    if (session?.pack) {
      setSaveName(session.pack.name || 'New Template Pack');
      setSaveDescription(session.pack.description || '');
      setSaveVersion(session.pack.version || '1.0.0');
    }
  }, [session?.pack]);

  const handleSave = async () => {
    if (!saveName.trim()) return;
    setSaveLoading(true);
    try {
      await savePack({
        name: saveName.trim(),
        description: saveDescription.trim() || undefined,
        version: saveVersion.trim(),
      });
      setShowSaveDialog(false);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDiscard = async () => {
    const success = await discardSession();
    if (success) {
      navigate('/admin/settings/project/templates');
    }
  };

  const handleApplySuggestion = useCallback(
    async (messageId: string, suggestionId: string) => {
      const result = await applySuggestion(messageId, suggestionId);
      if (!result.success && result.error) {
        console.error('Failed to apply suggestion:', result.error);
      }
    },
    [applySuggestion]
  );

  const handleRejectSuggestion = useCallback(
    async (messageId: string, suggestionId: string) => {
      const result = await rejectSuggestion(messageId, suggestionId);
      if (!result.success && result.error) {
        console.error('Failed to reject suggestion:', result.error);
      }
    },
    [rejectSuggestion]
  );

  if (!config.activeProjectId) {
    return (
      <div className="mx-auto container p-4">
        <div className="alert alert-warning">
          <Icon icon="lucide--alert-triangle" className="size-5" />
          <span>Please select a project to use the Template Pack Studio</span>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="page-template-pack-studio"
      className="flex flex-col h-full overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-base-300 bg-base-100 shrink-0">
        <div className="flex items-center gap-3">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/admin/settings/project/templates')}
            title="Back to Templates"
          >
            <Icon icon="lucide--arrow-left" className="size-4" />
          </button>
          <div>
            <h1 className="font-semibold text-lg flex items-center gap-2">
              <Icon icon="lucide--sparkles" className="size-5 text-primary" />
              Template Pack Studio
            </h1>
            <p className="text-sm text-base-content/60">
              {session?.pack?.name || 'Creating new pack...'}
              {session?.pack?.draft && (
                <span className="badge badge-warning badge-sm ml-2">Draft</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowDiscardConfirm(true)}
            disabled={isLoading}
          >
            <Icon icon="lucide--trash-2" className="size-4" />
            Discard
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowSaveDialog(true)}
            disabled={isLoading || !session}
          >
            <Icon icon="lucide--save" className="size-4" />
            Save Pack
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mx-4 mt-2">
          <div role="alert" className="alert alert-error text-sm py-2">
            <Icon icon="lucide--alert-circle" className="size-4" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && !session && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <span className="loading loading-spinner loading-lg text-primary"></span>
            <span className="text-sm text-base-content/60">
              Loading studio session...
            </span>
          </div>
        </div>
      )}

      {/* Main Content: Two-Panel Layout */}
      {session && (
        <SplitPanelLayout ratio="50/50" className="flex-1">
          <SplitPanelLayout.Left className="border-r border-base-300">
            <SchemaPreviewPanel pack={session.pack} />
          </SplitPanelLayout.Left>
          <SplitPanelLayout.Right>
            <TemplateStudioChat
              messages={messages}
              isStreaming={isStreaming}
              onSend={send}
              onStop={stop}
              onApplySuggestion={handleApplySuggestion}
              onRejectSuggestion={handleRejectSuggestion}
              onShowKeyboardShortcuts={() => setShowKeyboardShortcuts(true)}
            />
          </SplitPanelLayout.Right>
        </SplitPanelLayout>
      )}

      {/* Save Dialog */}
      <Modal
        open={showSaveDialog}
        onOpenChange={(open) => !open && setShowSaveDialog(false)}
        title="Save Template Pack"
        sizeClassName="max-w-md"
        actions={[
          {
            label: 'Cancel',
            variant: 'ghost',
            disabled: saveLoading,
            onClick: () => setShowSaveDialog(false),
          },
          {
            label: saveLoading ? 'Saving...' : 'Save',
            variant: 'primary',
            disabled: saveLoading || !saveName.trim(),
            autoFocus: true,
            onClick: handleSave,
          },
        ]}
      >
        <FormField
          label="Pack Name"
          required
          type="text"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder="My Template Pack"
        />
        <div className="form-control">
          <label className="label">
            <span className="label-text font-medium">Description</span>
            <span className="label-text-alt">Optional</span>
          </label>
          <textarea
            className="textarea textarea-bordered w-full"
            value={saveDescription}
            onChange={(e) => setSaveDescription(e.target.value)}
            placeholder="Describe what this template pack is for..."
            rows={3}
          />
        </div>
        <FormField
          label="Version"
          type="text"
          value={saveVersion}
          onChange={(e) => setSaveVersion(e.target.value)}
          placeholder="1.0.0"
        />
      </Modal>

      {/* Discard Confirmation Dialog */}
      <Modal
        open={showDiscardConfirm}
        onOpenChange={(open) => !open && setShowDiscardConfirm(false)}
        title="Discard Changes?"
        description="Are you sure you want to discard this draft? All unsaved changes will be lost."
        sizeClassName="max-w-sm"
        actions={[
          {
            label: 'Cancel',
            variant: 'ghost',
            onClick: () => setShowDiscardConfirm(false),
          },
          {
            label: 'Discard',
            variant: 'error',
            autoFocus: true,
            onClick: handleDiscard,
          },
        ]}
      />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showKeyboardShortcuts}
        onClose={() => setShowKeyboardShortcuts(false)}
      />
    </div>
  );
}

// ============================================================================
// Schema Preview Panel
// ============================================================================

interface SchemaPreviewPanelProps {
  pack: TemplatePack;
}

function SchemaPreviewPanel({ pack }: SchemaPreviewPanelProps) {
  const [showJson, setShowJson] = useState(false);

  const objectTypes = pack.object_type_schemas || {};
  const relationshipTypes = pack.relationship_type_schemas || {};

  const objectTypeCount = Object.keys(objectTypes).length;
  const relationshipTypeCount = Object.keys(relationshipTypes).length;

  // Compute relationships grouped by object type
  const relationshipsByType =
    computeRelationshipsByObjectType(relationshipTypes);

  return (
    <div className="flex flex-col h-full">
      {/* Panel Header */}
      <div className="px-4 py-3 border-b border-base-300 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Icon icon="lucide--file-json" className="size-4 text-primary" />
              Schema Preview
            </h2>
            <p className="text-xs text-base-content/60 mt-1">
              {objectTypeCount} object types, {relationshipTypeCount}{' '}
              relationship types
            </p>
          </div>
          <button
            className={`btn btn-ghost btn-sm gap-1 ${
              showJson ? 'btn-active' : ''
            }`}
            onClick={() => setShowJson(!showJson)}
          >
            <Icon icon="lucide--code" className="size-3.5" />
            {showJson ? 'Hide JSON' : 'Show JSON'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {showJson ? (
          // Raw JSON view
          <div className="bg-base-200 rounded-lg p-3">
            <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(
                {
                  name: pack.name,
                  version: pack.version,
                  description: pack.description,
                  object_types: objectTypes,
                  relationship_types: relationshipTypes,
                },
                null,
                2
              )}
            </pre>
          </div>
        ) : (
          // Object types with integrated relationships
          <>
            {objectTypeCount === 0 ? (
              <EmptyStateCard
                icon="lucide--boxes"
                title="No object types yet"
                description="Start chatting to add object types to your template pack"
              />
            ) : (
              Object.entries(objectTypes).map(([typeName, schema]) => {
                const rels = relationshipsByType[typeName] || {
                  outgoing: [],
                  incoming: [],
                };
                return (
                  <ObjectTypeCard
                    key={typeName}
                    typeName={typeName}
                    schema={schema as Record<string, unknown>}
                    outgoingRelationships={rels.outgoing}
                    incomingRelationships={rels.incoming}
                  />
                );
              })
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Object Type Card
// ============================================================================

interface ObjectTypeCardProps {
  typeName: string;
  schema: Record<string, unknown>;
  outgoingRelationships?: RelationshipInfo[];
  incomingRelationships?: RelationshipInfo[];
}

function ObjectTypeCard({
  typeName,
  schema,
  outgoingRelationships = [],
  incomingRelationships = [],
}: ObjectTypeCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const description = schema.description as string | undefined;
  const properties = schema.properties as Record<string, unknown> | undefined;
  const required = schema.required as string[] | undefined;

  const propertyCount = properties ? Object.keys(properties).length : 0;
  const totalRelationships =
    outgoingRelationships.length + incomingRelationships.length;

  return (
    <div className="bg-base-200 rounded-lg overflow-hidden">
      <button
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-base-300/50 transition-colors text-left"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon
            icon={isExpanded ? 'lucide--chevron-down' : 'lucide--chevron-right'}
            className="size-4 shrink-0 text-base-content/60"
          />
          <Icon icon="lucide--box" className="size-4 shrink-0 text-primary" />
          <span className="font-semibold truncate">{typeName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge badge-ghost badge-sm">
            {propertyCount} properties
          </span>
          {totalRelationships > 0 && (
            <span className="badge badge-secondary badge-sm">
              {totalRelationships} rel
            </span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          {description && (
            <p className="text-sm text-base-content/70">{description}</p>
          )}

          {/* Properties Section */}
          {properties && propertyCount > 0 && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-base-content/60 uppercase tracking-wide">
                Properties
              </div>
              {Object.entries(properties).map(([propName, propDef]) => {
                const prop = propDef as Record<string, unknown>;
                const isRequired = required?.includes(propName);
                const examples = prop.examples as unknown[] | undefined;
                return (
                  <div
                    key={propName}
                    className="bg-base-100 px-3 py-2 rounded text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-medium">{propName}</span>
                      {isRequired && (
                        <span className="badge badge-error badge-xs">
                          required
                        </span>
                      )}
                      {typeof prop.type === 'string' && (
                        <span className="text-base-content/60">
                          {prop.type}
                        </span>
                      )}
                      {Array.isArray(prop.enum) && (
                        <span className="text-base-content/60">enum</span>
                      )}
                    </div>
                    {typeof prop.description === 'string' && (
                      <div className="mt-1 text-base-content/60">
                        {prop.description}
                      </div>
                    )}
                    {Array.isArray(prop.enum) && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {prop.enum.map((val, idx) => (
                          <span key={idx} className="badge badge-xs">
                            {String(val)}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Examples display */}
                    {examples && examples.length > 0 && (
                      <div className="mt-1.5 pt-1.5 border-t border-base-200">
                        <span className="text-base-content/50 text-[10px] uppercase tracking-wide">
                          Examples:
                        </span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {examples.slice(0, 5).map((ex, idx) => (
                            <span
                              key={idx}
                              className="badge badge-outline badge-xs font-mono"
                            >
                              {typeof ex === 'string' ? ex : JSON.stringify(ex)}
                            </span>
                          ))}
                          {examples.length > 5 && (
                            <span className="text-base-content/40 text-[10px]">
                              +{examples.length - 5} more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Relationships Section */}
          {totalRelationships > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-medium text-base-content/60 uppercase tracking-wide">
                Relationships
              </div>

              {/* Outgoing Relationships */}
              {outgoingRelationships.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] text-base-content/50 flex items-center gap-1">
                    <Icon icon="lucide--arrow-right" className="size-3" />
                    Outgoing
                  </div>
                  {outgoingRelationships.map((rel) => (
                    <RelationshipItem
                      key={`out-${rel.type}`}
                      relationship={rel}
                      direction="outgoing"
                      currentType={typeName}
                    />
                  ))}
                </div>
              )}

              {/* Incoming Relationships */}
              {incomingRelationships.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] text-base-content/50 flex items-center gap-1">
                    <Icon icon="lucide--arrow-left" className="size-3" />
                    Incoming
                  </div>
                  {incomingRelationships.map((rel) => (
                    <RelationshipItem
                      key={`in-${rel.type}`}
                      relationship={rel}
                      direction="incoming"
                      currentType={typeName}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Relationship Item (inline display within ObjectTypeCard)
// ============================================================================

interface RelationshipItemProps {
  relationship: RelationshipInfo;
  direction: 'outgoing' | 'incoming';
  currentType: string;
}

function RelationshipItem({
  relationship,
  direction,
  currentType,
}: RelationshipItemProps) {
  const [showDetails, setShowDetails] = useState(false);
  const {
    type,
    description,
    label,
    inverseLabel,
    sourceTypes,
    targetTypes,
    multiplicity,
  } = relationship;

  // For outgoing: show target types (where the arrow points to)
  // For incoming: show source types (where the arrow comes from)
  const relatedTypes =
    direction === 'outgoing'
      ? targetTypes.filter((t) => t !== currentType)
      : sourceTypes.filter((t) => t !== currentType);

  const displayLabel = direction === 'outgoing' ? label : inverseLabel;

  return (
    <div className="bg-base-100 rounded text-xs">
      <button
        className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-base-200/50 transition-colors"
        onClick={() => setShowDetails(!showDetails)}
      >
        <Icon
          icon={showDetails ? 'lucide--chevron-down' : 'lucide--chevron-right'}
          className="size-3 shrink-0 text-base-content/40"
        />
        <Icon icon="lucide--link" className="size-3 shrink-0 text-secondary" />
        <span className="font-mono font-medium text-secondary">{type}</span>
        {displayLabel && (
          <span className="text-base-content/60">"{displayLabel}"</span>
        )}
        <Icon
          icon="lucide--arrow-right"
          className="size-3 text-base-content/40"
        />
        <div className="flex flex-wrap gap-1">
          {relatedTypes.slice(0, 3).map((t) => (
            <span key={t} className="badge badge-outline badge-xs">
              {t}
            </span>
          ))}
          {relatedTypes.length > 3 && (
            <span className="text-base-content/40">
              +{relatedTypes.length - 3}
            </span>
          )}
        </div>
      </button>

      {showDetails && (
        <div className="px-3 pb-2 pt-0 space-y-2 border-t border-base-200 mt-1">
          {description && (
            <p className="text-base-content/60 text-[11px] italic">
              {description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            {/* Source Types */}
            <div className="bg-base-200/50 p-1.5 rounded">
              <div className="text-[10px] text-base-content/50 mb-1">
                Source Types
              </div>
              <div className="flex flex-wrap gap-1">
                {sourceTypes.map((t) => (
                  <span
                    key={t}
                    className={`badge badge-xs ${
                      t === currentType ? 'badge-primary' : ''
                    }`}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>

            {/* Target Types */}
            <div className="bg-base-200/50 p-1.5 rounded">
              <div className="text-[10px] text-base-content/50 mb-1">
                Target Types
              </div>
              <div className="flex flex-wrap gap-1">
                {targetTypes.map((t) => (
                  <span
                    key={t}
                    className={`badge badge-xs ${
                      t === currentType ? 'badge-primary' : ''
                    }`}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Labels */}
          {(label || inverseLabel) && (
            <div className="flex items-center gap-2 text-[11px]">
              {label && (
                <span className="bg-base-200/50 px-1.5 py-0.5 rounded">
                  {label}
                </span>
              )}
              {label && inverseLabel && (
                <Icon
                  icon="lucide--arrow-left-right"
                  className="size-3 text-base-content/40"
                />
              )}
              {inverseLabel && (
                <span className="bg-base-200/50 px-1.5 py-0.5 rounded">
                  {inverseLabel}
                </span>
              )}
            </div>
          )}

          {/* Multiplicity */}
          {multiplicity && (
            <div className="text-[10px] text-base-content/50">
              Multiplicity: {multiplicity.src || 'many'} →{' '}
              {multiplicity.dst || 'many'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Template Studio Chat
// ============================================================================

interface TemplateStudioChatProps {
  messages: StudioMessage[];
  isStreaming: boolean;
  onSend: (content: string) => Promise<void>;
  onStop: () => void;
  onApplySuggestion: (messageId: string, suggestionId: string) => void;
  onRejectSuggestion: (messageId: string, suggestionId: string) => void;
  onShowKeyboardShortcuts?: () => void;
}

function TemplateStudioChat({
  messages,
  isStreaming,
  onSend,
  onStop,
  onApplySuggestion,
  onRejectSuggestion,
  onShowKeyboardShortcuts,
}: TemplateStudioChatProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!inputValue.trim() || isStreaming) return;

      const message = inputValue.trim();
      setInputValue('');
      await onSend(message);
    },
    [inputValue, isStreaming, onSend]
  );

  // Build message history for ChatInput (user messages only, most recent first)
  const messageHistory = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .reverse();

  return (
    <div className="flex flex-col h-full bg-base-100">
      {/* Header */}
      <div className="shrink-0 px-4 py-3 border-b border-base-300">
        <div className="flex items-center gap-2">
          <Icon icon="lucide--message-square" className="size-5 text-primary" />
          <div>
            <h3 className="font-semibold text-sm">AI Assistant</h3>
            <p className="text-xs text-base-content/60">
              Describe your template pack requirements
            </p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
        {/* Empty State */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-base-content/60 py-8">
            <Icon
              icon="lucide--message-square-plus"
              className="size-12 mb-3 opacity-40"
            />
            <p className="text-sm font-medium mb-1">Start building your pack</p>
            <p className="text-xs max-w-[280px]">
              Describe the object types you want to create, or ask the AI to
              suggest a schema based on your use case.
            </p>
          </div>
        )}

        {/* Messages */}
        {messages.map((message) => (
          <StudioMessageItem
            key={message.id}
            message={message}
            onApplySuggestion={onApplySuggestion}
            onRejectSuggestion={onRejectSuggestion}
          />
        ))}

        {/* Streaming Indicator */}
        {isStreaming && (
          <div className="flex items-center gap-2 text-xs text-base-content/60">
            <span className="loading loading-dots loading-xs"></span>
            <span>AI is thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area - using shared ChatInput component */}
      <div className="shrink-0">
        <ChatInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleSubmit}
          disabled={isStreaming}
          placeholder="Describe the object types you need..."
          onStop={onStop}
          isStreaming={isStreaming}
          messageHistory={messageHistory}
          onShowKeyboardShortcuts={onShowKeyboardShortcuts}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Studio Message Item
// ============================================================================

interface StudioMessageItemProps {
  message: StudioMessage;
  onApplySuggestion: (messageId: string, suggestionId: string) => void;
  onRejectSuggestion: (messageId: string, suggestionId: string) => void;
}

function StudioMessageItem({
  message,
  onApplySuggestion,
  onRejectSuggestion,
}: StudioMessageItemProps) {
  const isAssistant = message.role === 'assistant';
  const formattedTime = formatTimestamp(message.createdAt);

  return (
    <div className={`chat ${isAssistant ? 'chat-start' : 'chat-end'}`}>
      {/* Avatar for assistant */}
      {isAssistant && (
        <div className="chat-image">
          <div className="bg-primary/10 text-primary flex items-center justify-center rounded-full size-8">
            <Icon icon="lucide--sparkles" className="size-4" />
          </div>
        </div>
      )}

      {/* Message Bubble */}
      <div
        className={`chat-bubble ${
          isAssistant
            ? 'bg-base-200 text-base-content'
            : 'bg-primary text-primary-content'
        } max-w-[85%]`}
      >
        {isAssistant ? (
          <div className="prose prose-sm max-w-none prose-neutral dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {stripSuggestionsFromContent(message.content)}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="whitespace-pre-wrap text-sm">{message.content}</div>
        )}

        {/* Suggestions */}
        {message.suggestions && message.suggestions.length > 0 && (
          <div className="mt-3 space-y-2">
            {message.suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={convertToUnifiedSuggestion(suggestion)}
                onApply={() => onApplySuggestion(message.id, suggestion.id)}
                onReject={() => onRejectSuggestion(message.id, suggestion.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <div className="chat-footer opacity-50 text-xs mt-1">{formattedTime}</div>
    </div>
  );
}

// ============================================================================
// Schema Change Preview - Property-level diff view
// ============================================================================

interface SchemaChangePreviewProps {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

interface PropertyChange {
  key: string;
  changeType: 'added' | 'removed' | 'modified';
  oldValue?: unknown;
  newValue?: unknown;
  oldType?: string;
  newType?: string;
}

/**
 * Compute property-level changes between two JSON Schemas
 */
function computeSchemaPropertyChanges(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): PropertyChange[] {
  const changes: PropertyChange[] = [];

  const beforeProps = (before?.properties as Record<string, unknown>) || {};
  const afterProps = (after?.properties as Record<string, unknown>) || {};

  const beforeKeys = new Set(Object.keys(beforeProps));
  const afterKeys = new Set(Object.keys(afterProps));

  // Find added properties
  for (const key of afterKeys) {
    if (!beforeKeys.has(key)) {
      const prop = afterProps[key] as Record<string, unknown>;
      changes.push({
        key,
        changeType: 'added',
        newValue: prop,
        newType: getPropertyTypeLabel(prop),
      });
    }
  }

  // Find removed properties
  for (const key of beforeKeys) {
    if (!afterKeys.has(key)) {
      const prop = beforeProps[key] as Record<string, unknown>;
      changes.push({
        key,
        changeType: 'removed',
        oldValue: prop,
        oldType: getPropertyTypeLabel(prop),
      });
    }
  }

  // Find modified properties
  for (const key of beforeKeys) {
    if (afterKeys.has(key)) {
      const oldProp = beforeProps[key] as Record<string, unknown>;
      const newProp = afterProps[key] as Record<string, unknown>;

      if (JSON.stringify(oldProp) !== JSON.stringify(newProp)) {
        changes.push({
          key,
          changeType: 'modified',
          oldValue: oldProp,
          newValue: newProp,
          oldType: getPropertyTypeLabel(oldProp),
          newType: getPropertyTypeLabel(newProp),
        });
      }
    }
  }

  // Check for 'required' array changes
  const beforeRequired = (before?.required as string[]) || [];
  const afterRequired = (after?.required as string[]) || [];
  const beforeRequiredSet = new Set(beforeRequired);
  const afterRequiredSet = new Set(afterRequired);

  for (const key of afterRequiredSet) {
    if (!beforeRequiredSet.has(key) && beforeKeys.has(key)) {
      // Property became required
      const existingChange = changes.find((c) => c.key === key);
      if (!existingChange) {
        changes.push({
          key,
          changeType: 'modified',
          oldValue: { required: false },
          newValue: { required: true },
          oldType: 'optional',
          newType: 'required',
        });
      }
    }
  }

  for (const key of beforeRequiredSet) {
    if (!afterRequiredSet.has(key) && afterKeys.has(key)) {
      // Property became optional
      const existingChange = changes.find((c) => c.key === key);
      if (!existingChange) {
        changes.push({
          key,
          changeType: 'modified',
          oldValue: { required: true },
          newValue: { required: false },
          oldType: 'required',
          newType: 'optional',
        });
      }
    }
  }

  return changes;
}

/**
 * Get a human-readable label for a JSON Schema property type
 */
function getPropertyTypeLabel(prop: Record<string, unknown>): string {
  if (!prop) return 'unknown';

  const type = prop.type as string | string[];
  const format = prop.format as string | undefined;
  const enumValues = prop.enum as unknown[] | undefined;

  if (enumValues && Array.isArray(enumValues)) {
    return `enum(${enumValues.length})`;
  }

  if (Array.isArray(type)) {
    return type.join(' | ');
  }

  if (format) {
    return `${type}(${format})`;
  }

  if (type === 'array') {
    const items = prop.items as Record<string, unknown> | undefined;
    if (items?.type) {
      return `${items.type}[]`;
    }
    return 'array';
  }

  return type || 'unknown';
}

/**
 * Format a property value for display (truncated)
 */
function formatPropertyValue(prop: Record<string, unknown>): string {
  if (!prop) return '';

  const parts: string[] = [];

  // Type info
  const typeLabel = getPropertyTypeLabel(prop);
  parts.push(typeLabel);

  // Description (truncated)
  if (prop.description) {
    const desc = String(prop.description);
    parts.push(desc.length > 40 ? `"${desc.slice(0, 40)}..."` : `"${desc}"`);
  }

  // Enum values
  if (prop.enum && Array.isArray(prop.enum)) {
    const enumStr = prop.enum
      .slice(0, 3)
      .map((v) => JSON.stringify(v))
      .join(', ');
    parts.push(`[${enumStr}${prop.enum.length > 3 ? ', ...' : ''}]`);
  }

  return parts.join(' ');
}

/**
 * Get full property value for tooltip (un-truncated)
 */
function getFullPropertyValue(prop: Record<string, unknown>): string {
  if (!prop) return '';

  const parts: string[] = [];

  // Type info
  const typeLabel = getPropertyTypeLabel(prop);
  parts.push(typeLabel);

  // Description (full)
  if (prop.description) {
    parts.push(`"${String(prop.description)}"`);
  }

  // Enum values (all)
  if (prop.enum && Array.isArray(prop.enum)) {
    const enumStr = prop.enum.map((v) => JSON.stringify(v)).join(', ');
    parts.push(`[${enumStr}]`);
  }

  return parts.join(' ');
}

/**
 * PropertyValueDisplay - Displays property value with tooltip for truncated content
 * Pattern follows SuggestionCard.tsx for consistent tooltip behavior
 */
function PropertyValueDisplay({
  prop,
  className = '',
}: {
  prop: Record<string, unknown>;
  className?: string;
}) {
  const truncatedValue = formatPropertyValue(prop);
  const fullValue = getFullPropertyValue(prop);
  // Show tooltip only if the full value differs from truncated (i.e., was actually truncated)
  const showTooltip = fullValue !== truncatedValue;

  if (showTooltip) {
    return (
      <Tooltip
        content={fullValue}
        placement="bottom"
        className="min-w-0 shrink overflow-visible"
      >
        <span className={`cursor-help truncate block ${className}`}>
          {truncatedValue}
        </span>
      </Tooltip>
    );
  }

  return (
    <span className={`truncate min-w-0 ${className}`}>{truncatedValue}</span>
  );
}

function SchemaChangePreview({ before, after }: SchemaChangePreviewProps) {
  const [showRaw, setShowRaw] = useState(false);

  if (!before && !after) return null;

  const changes = computeSchemaPropertyChanges(before, after);

  // Group changes by type for better display
  const added = changes.filter((c) => c.changeType === 'added');
  const removed = changes.filter((c) => c.changeType === 'removed');
  const modified = changes.filter((c) => c.changeType === 'modified');

  return (
    <div className="bg-base-200/50 rounded p-2 text-xs">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-base-content/60 font-medium">
          Property Changes
          {changes.length > 0 && (
            <span className="ml-1.5 text-base-content/40">
              ({changes.length})
            </span>
          )}
        </span>
        <button
          className="btn btn-ghost btn-xs"
          onClick={() => setShowRaw(!showRaw)}
        >
          {showRaw ? 'Hide' : 'Show'} JSON
        </button>
      </div>

      {showRaw ? (
        <div className="grid grid-cols-2 gap-2 mt-2">
          {before && (
            <div>
              <div className="text-error/70 text-[10px] font-medium mb-1">
                Before
              </div>
              <pre className="bg-error/5 p-1 rounded text-[10px] overflow-x-auto max-h-48">
                {JSON.stringify(before, null, 2)}
              </pre>
            </div>
          )}
          {after && (
            <div>
              <div className="text-success/70 text-[10px] font-medium mb-1">
                After
              </div>
              <pre className="bg-success/5 p-1 rounded text-[10px] overflow-x-auto max-h-48">
                {JSON.stringify(after, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1">
          {/* Added properties */}
          {added.map((change) => (
            <div
              key={`add-${change.key}`}
              className="flex items-start gap-1.5 py-0.5"
            >
              <Icon
                icon="lucide--plus"
                className="size-3 text-success shrink-0 mt-0.5"
              />
              <span className="font-mono text-success font-medium">
                {change.key}
              </span>
              <PropertyValueDisplay
                prop={change.newValue as Record<string, unknown>}
                className="text-base-content/50"
              />
            </div>
          ))}

          {/* Removed properties */}
          {removed.map((change) => (
            <div
              key={`rem-${change.key}`}
              className="flex items-start gap-1.5 py-0.5"
            >
              <Icon
                icon="lucide--minus"
                className="size-3 text-error shrink-0 mt-0.5"
              />
              <span className="font-mono text-error line-through">
                {change.key}
              </span>
              <span className="text-base-content/40 line-through">
                {change.oldType}
              </span>
            </div>
          ))}

          {/* Modified properties */}
          {modified.map((change) => (
            <div
              key={`mod-${change.key}`}
              className="flex items-start gap-1.5 py-0.5"
            >
              <Icon
                icon="lucide--pencil"
                className="size-3 text-warning shrink-0 mt-0.5"
              />
              <span className="font-mono text-base-content font-medium">
                {change.key}
              </span>
              <PropertyValueDisplay
                prop={change.oldValue as Record<string, unknown>}
                className="text-error/70 line-through text-[10px]"
              />
              <Icon
                icon="lucide--arrow-right"
                className="size-2.5 text-base-content/40 shrink-0"
              />
              <PropertyValueDisplay
                prop={change.newValue as Record<string, unknown>}
                className="text-success text-[10px]"
              />
            </div>
          ))}

          {/* No changes detected - show raw property count as fallback */}
          {changes.length === 0 && after && (
            <div className="text-base-content/50 italic">
              {typeof after.properties === 'object' && after.properties !== null
                ? `${
                    Object.keys(after.properties as object).length
                  } properties (no changes detected)`
                : 'Schema update'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

interface EmptyStateCardProps {
  icon: string;
  title: string;
  description: string;
}

function EmptyStateCard({ icon, title, description }: EmptyStateCardProps) {
  return (
    <div className="bg-base-200 rounded-lg p-8 text-center">
      <Icon icon={icon} className="size-10 mx-auto mb-3 text-base-content/30" />
      <h3 className="font-medium text-sm text-base-content/70">{title}</h3>
      <p className="text-xs text-base-content/50 mt-1">{description}</p>
    </div>
  );
}

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { TwoPanelLayout, Panel } from '@/components/layouts';
import { useApi } from '@/hooks/use-api';
import {
  PROMPT_DEFINITIONS,
  PROMPT_CATEGORIES,
  getPromptDefinition,
  getPromptsByCategory,
  type PromptDefinition,
  type PromptCategory,
} from './prompts-config';

// ============================================================================
// Types
// ============================================================================

interface LangfusePromptState {
  value: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  version: number | null;
  fromLangfuse: boolean;
  notFound: boolean;
  isDirty: boolean;
}

// ============================================================================
// Hook: useLangfusePrompt
// ============================================================================

function useLangfusePrompt(promptId: string | null, defaultValue: string) {
  const { apiBase, fetchJson } = useApi();
  const [state, setState] = useState<LangfusePromptState>({
    value: defaultValue,
    loading: true,
    saving: false,
    error: null,
    version: null,
    fromLangfuse: false,
    notFound: false,
    isDirty: false,
  });
  const [originalValue, setOriginalValue] = useState(defaultValue);

  // Fetch prompt from API
  useEffect(() => {
    if (!promptId) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    (async () => {
      try {
        const data = await fetchJson<{
          name: string;
          prompt: string;
          version: number;
          labels: string[];
          fromLangfuse: boolean;
        }>(`${apiBase}/api/prompts/${encodeURIComponent(promptId)}`);

        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            value: data.prompt,
            version: data.version,
            fromLangfuse: data.fromLangfuse,
            loading: false,
            notFound: false,
            isDirty: false,
          }));
          setOriginalValue(data.prompt);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const errorMessage =
            e instanceof Error ? e.message : 'Failed to load prompt';
          const isNotFound =
            errorMessage.includes('404') || errorMessage.includes('not found');
          setState((prev) => ({
            ...prev,
            value: defaultValue,
            loading: false,
            notFound: isNotFound,
            fromLangfuse: false,
            error: isNotFound ? null : errorMessage,
            isDirty: false,
          }));
          setOriginalValue(defaultValue);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [promptId, defaultValue, apiBase, fetchJson]);

  const setValue = useCallback(
    (newValue: string) => {
      setState((prev) => ({
        ...prev,
        value: newValue,
        isDirty: newValue !== originalValue,
      }));
    },
    [originalValue]
  );

  const save = useCallback(async () => {
    if (!promptId) return;

    setState((prev) => ({ ...prev, saving: true, error: null }));
    try {
      const result = await fetchJson<
        { name: string; version: number; labels: string[] },
        { prompt: string; labels: string[]; commitMessage?: string }
      >(`${apiBase}/api/prompts/${encodeURIComponent(promptId)}`, {
        method: 'PUT',
        body: {
          prompt: state.value,
          labels: ['production'],
          commitMessage: `Updated from AI Prompts settings`,
        },
      });
      setState((prev) => ({
        ...prev,
        saving: false,
        version: result.version,
        fromLangfuse: true,
        notFound: false,
        isDirty: false,
      }));
      setOriginalValue(state.value);
    } catch (e: unknown) {
      const errorMessage =
        e instanceof Error ? e.message : 'Failed to save prompt';
      setState((prev) => ({
        ...prev,
        saving: false,
        error: errorMessage,
      }));
    }
  }, [promptId, state.value, apiBase, fetchJson]);

  const restoreDefault = useCallback(() => {
    setState((prev) => ({
      ...prev,
      value: defaultValue,
      isDirty: defaultValue !== originalValue,
    }));
  }, [defaultValue, originalValue]);

  const discardChanges = useCallback(() => {
    setState((prev) => ({
      ...prev,
      value: originalValue,
      isDirty: false,
    }));
  }, [originalValue]);

  return { ...state, setValue, save, restoreDefault, discardChanges };
}

// ============================================================================
// Components
// ============================================================================

interface PromptSidebarProps {
  selectedPromptId: string | null;
  onSelectPrompt: (id: string) => void;
  promptStates: Map<string, { fromLangfuse: boolean; isDirty: boolean }>;
}

function PromptSidebar({
  selectedPromptId,
  onSelectPrompt,
  promptStates,
}: PromptSidebarProps) {
  return (
    <Panel className="bg-base-200 border-r border-base-300">
      <Panel.Header className="p-4 border-b border-base-300">
        <h2 className="font-semibold text-lg">AI Prompts</h2>
        <p className="text-xs text-base-content/60 mt-1">
          Manage system prompts synced with Langfuse
        </p>
      </Panel.Header>

      <Panel.Content className="p-2">
        {PROMPT_CATEGORIES.map((category) => {
          const prompts = getPromptsByCategory(category.id as PromptCategory);
          if (prompts.length === 0) return null;

          return (
            <div key={category.id} className="mb-4">
              <div className="flex items-center gap-2 px-2 py-1 text-xs font-medium text-base-content/50 uppercase tracking-wider">
                <Icon icon={category.icon} className="size-3" aria-hidden />
                {category.name}
              </div>
              <ul className="menu menu-sm p-0 mt-1">
                {prompts.map((prompt) => {
                  const state = promptStates.get(prompt.id);
                  const isSelected = selectedPromptId === prompt.id;

                  return (
                    <li key={prompt.id}>
                      <button
                        onClick={() => onSelectPrompt(prompt.id)}
                        className={`flex items-center gap-2 ${
                          isSelected ? 'active' : ''
                        }`}
                      >
                        <Icon
                          icon={prompt.icon}
                          className="size-4 shrink-0"
                          aria-hidden
                        />
                        <span className="truncate flex-1">{prompt.name}</span>
                        <div className="flex items-center gap-1">
                          {state?.isDirty && (
                            <span
                              className="badge badge-warning badge-xs"
                              title="Unsaved changes"
                            >
                              *
                            </span>
                          )}
                          {state?.fromLangfuse && (
                            <span
                              className="badge badge-info badge-xs"
                              title="Synced with Langfuse"
                            >
                              LF
                            </span>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </Panel.Content>
    </Panel>
  );
}

interface PromptEditorProps {
  prompt: PromptDefinition;
  state: ReturnType<typeof useLangfusePrompt>;
}

function PromptEditor({ prompt, state }: PromptEditorProps) {
  const hasRequiredPlaceholders =
    !prompt.requiredPlaceholders ||
    prompt.requiredPlaceholders.every((p) => state.value.includes(p));

  return (
    <Panel className="bg-base-100">
      {/* Header */}
      <Panel.Header className="p-4 border-b border-base-300">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Icon icon={prompt.icon} className="size-5" aria-hidden />
              <h1 className="font-semibold text-xl">{prompt.name}</h1>
              {state.fromLangfuse && state.version && (
                <span className="badge badge-ghost badge-sm">
                  v{state.version}
                </span>
              )}
              {state.notFound && (
                <span className="badge badge-warning badge-sm">New</span>
              )}
              {state.isDirty && (
                <span className="badge badge-warning badge-sm">Unsaved</span>
              )}
            </div>
            <p className="text-sm text-base-content/70 mt-1">
              {prompt.description}
            </p>
            {prompt.requiredPlaceholders && (
              <p className="text-xs text-base-content/50 mt-1">
                Required placeholders:{' '}
                {prompt.requiredPlaceholders.map((p) => (
                  <code
                    key={p}
                    className={`mx-1 px-1 py-0.5 rounded ${
                      state.value.includes(p)
                        ? 'bg-success/20 text-success'
                        : 'bg-error/20 text-error'
                    }`}
                  >
                    {p}
                  </code>
                ))}
              </p>
            )}
          </div>
          <a
            href={`${
              import.meta.env.VITE_LANGFUSE_HOST || 'http://localhost:3011'
            }/prompts`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-ghost gap-1"
          >
            <Icon icon="lucide--external-link" className="size-3" aria-hidden />
            Langfuse
          </a>
        </div>
      </Panel.Header>

      {/* Editor area - scrollable */}
      <Panel.Content className="p-4">
        {state.loading ? (
          <div className="flex items-center justify-center h-full">
            <Spinner size="lg" />
          </div>
        ) : (
          <textarea
            className="w-full h-full textarea textarea-bordered font-mono text-sm resize-none"
            value={state.value}
            onChange={(e) => state.setValue(e.target.value)}
            placeholder={prompt.defaultValue}
          />
        )}
      </Panel.Content>

      {/* Fixed footer with actions */}
      <Panel.Footer className="p-4 border-t border-base-300">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {state.error && (
              <div className="alert alert-error alert-sm py-1 px-3">
                <Icon icon="lucide--alert-circle" className="size-4" />
                <span className="text-sm">{state.error}</span>
              </div>
            )}
            {state.notFound && !state.error && (
              <div className="alert alert-warning alert-sm py-1 px-3">
                <Icon icon="lucide--info" className="size-4" />
                <span className="text-sm">
                  This prompt doesn't exist in Langfuse yet. Saving will create
                  it.
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {state.isDirty && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={state.discardChanges}
                disabled={state.saving}
              >
                Discard
              </button>
            )}
            <button
              className="btn btn-sm btn-ghost"
              onClick={state.restoreDefault}
              disabled={state.saving}
            >
              Restore default
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={state.save}
              disabled={
                state.saving || state.loading || !hasRequiredPlaceholders
              }
              title={
                !hasRequiredPlaceholders
                  ? `Missing required placeholders: ${prompt.requiredPlaceholders?.join(
                      ', '
                    )}`
                  : undefined
              }
            >
              {state.saving ? (
                <>
                  <Spinner size="xs" />
                  Saving...
                </>
              ) : state.notFound ? (
                'Create in Langfuse'
              ) : (
                'Save to Langfuse'
              )}
            </button>
          </div>
        </div>
      </Panel.Footer>
    </Panel>
  );
}

function EmptyState() {
  return (
    <Panel className="bg-base-100">
      <Panel.Content className="flex items-center justify-center">
        <div className="text-center p-8">
          <Icon
            icon="lucide--book-text"
            className="size-16 text-base-content/20 mb-4"
            aria-hidden
          />
          <h2 className="text-lg font-medium text-base-content/60">
            Select a prompt to edit
          </h2>
          <p className="text-sm text-base-content/40 mt-2 max-w-md">
            Choose a prompt from the sidebar to view and edit it. Changes are
            synced with Langfuse for version control and A/B testing.
          </p>
        </div>
      </Panel.Content>
    </Panel>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function AiPromptsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPromptId = searchParams.get('prompt');

  // Get the selected prompt definition
  const selectedPrompt = selectedPromptId
    ? getPromptDefinition(selectedPromptId)
    : null;

  // Use the hook for the selected prompt
  const promptState = useLangfusePrompt(
    selectedPromptId,
    selectedPrompt?.defaultValue || ''
  );

  // Track states for sidebar indicators (simplified - just track selected)
  const promptStates = new Map<
    string,
    { fromLangfuse: boolean; isDirty: boolean }
  >();
  if (selectedPromptId) {
    promptStates.set(selectedPromptId, {
      fromLangfuse: promptState.fromLangfuse,
      isDirty: promptState.isDirty,
    });
  }

  const handleSelectPrompt = useCallback(
    (id: string) => {
      // Warn if there are unsaved changes
      if (promptState.isDirty) {
        if (
          !window.confirm(
            'You have unsaved changes. Are you sure you want to switch prompts?'
          )
        ) {
          return;
        }
      }
      setSearchParams({ prompt: id });
    },
    [promptState.isDirty, setSearchParams]
  );

  // Auto-select first prompt if none selected
  useEffect(() => {
    if (!selectedPromptId && PROMPT_DEFINITIONS.length > 0) {
      setSearchParams({ prompt: PROMPT_DEFINITIONS[0].id }, { replace: true });
    }
  }, [selectedPromptId, setSearchParams]);

  return (
    <TwoPanelLayout
      data-testid="page-settings-ai-prompts"
      fixedPanel="left"
      fixedWidth={256}
    >
      <TwoPanelLayout.Left>
        <PromptSidebar
          selectedPromptId={selectedPromptId}
          onSelectPrompt={handleSelectPrompt}
          promptStates={promptStates}
        />
      </TwoPanelLayout.Left>

      <TwoPanelLayout.Right>
        {selectedPrompt ? (
          <PromptEditor prompt={selectedPrompt} state={promptState} />
        ) : (
          <EmptyState />
        )}
      </TwoPanelLayout.Right>
    </TwoPanelLayout>
  );
}

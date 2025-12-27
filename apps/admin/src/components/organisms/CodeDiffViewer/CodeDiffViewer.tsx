import { DiffEditor } from '@monaco-editor/react';
import { Spinner } from '@/components/atoms/Spinner';

export type DiffViewMode = 'side-by-side' | 'inline';

export interface CodeDiffViewerProps {
  /** Original (left) content for comparison */
  original: string;
  /** Modified (right) content for comparison */
  modified: string;
  /** Language for syntax highlighting (e.g., 'html', 'json', 'javascript') */
  language?: string;
  /** View mode: side-by-side or inline diff */
  viewMode?: DiffViewMode;
  /** Editor height (CSS value) */
  height?: string | number;
  /** Make editors read-only */
  readOnly?: boolean;
  /** Theme override ('vs-dark' or 'light') */
  theme?: 'vs-dark' | 'light';
  /** Label for original content (shown in UI if provided) */
  originalLabel?: string;
  /** Label for modified content (shown in UI if provided) */
  modifiedLabel?: string;
  /** Additional CSS class for the container */
  className?: string;
  /** Whether to ignore whitespace differences */
  ignoreTrimWhitespace?: boolean;
}

/**
 * Reusable code diff viewer component using Monaco DiffEditor.
 *
 * Features:
 * - Side-by-side or inline diff view
 * - Syntax highlighting for multiple languages
 * - Dark/light theme support
 * - Optional labels for original/modified content
 * - Lazy loading with spinner
 *
 * @example
 * ```tsx
 * <CodeDiffViewer
 *   original={currentMjml}
 *   modified={newMjml}
 *   language="html"
 *   viewMode="side-by-side"
 *   originalLabel="Current"
 *   modifiedLabel="Proposed"
 * />
 * ```
 */
export function CodeDiffViewer({
  original,
  modified,
  language = 'plaintext',
  viewMode = 'side-by-side',
  height = '400px',
  readOnly = true,
  theme = 'vs-dark',
  originalLabel,
  modifiedLabel,
  className = '',
  ignoreTrimWhitespace = false,
}: CodeDiffViewerProps) {
  return (
    <div className={`flex flex-col ${className}`}>
      {(originalLabel || modifiedLabel) && viewMode === 'side-by-side' && (
        <div className="flex bg-base-200 text-xs font-medium text-base-content/70 border-b border-base-300">
          <div className="flex-1 px-3 py-1.5 border-r border-base-300">
            {originalLabel || 'Original'}
          </div>
          <div className="flex-1 px-3 py-1.5">
            {modifiedLabel || 'Modified'}
          </div>
        </div>
      )}
      {(originalLabel || modifiedLabel) && viewMode === 'inline' && (
        <div className="flex bg-base-200 text-xs font-medium text-base-content/70 border-b border-base-300">
          <div className="px-3 py-1.5">
            {originalLabel || 'Original'} → {modifiedLabel || 'Modified'}
          </div>
        </div>
      )}

      <DiffEditor
        height={height}
        language={language}
        theme={theme}
        original={original}
        modified={modified}
        loading={
          <div className="flex items-center justify-center h-full bg-base-200">
            <Spinner size="md" />
          </div>
        }
        options={{
          renderSideBySide: viewMode === 'side-by-side',
          readOnly,
          enableSplitViewResizing: true,
          ignoreTrimWhitespace,
          renderOverviewRuler: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          fontSize: 12,
          lineNumbers: 'on',
          wordWrap: 'on',
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
        }}
      />
    </div>
  );
}

export default CodeDiffViewer;

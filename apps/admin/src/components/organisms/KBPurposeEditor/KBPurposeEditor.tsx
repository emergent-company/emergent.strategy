import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useApi } from '@/hooks/use-api';
import { useToast } from '@/hooks/use-toast';
import { Spinner } from '@/components/atoms/Spinner';

interface KBPurposeEditorProps {
  projectId: string;
}

export const KBPurposeEditor: React.FC<KBPurposeEditorProps> = ({
  projectId,
}) => {
  const { fetchJson } = useApi();
  const { showToast } = useToast();
  const [purpose, setPurpose] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Load current KB purpose
  useEffect(() => {
    const loadPurpose = async () => {
      if (!projectId) return;

      setLoading(true);
      try {
        const project = await fetchJson<{ kb_purpose?: string }>(
          `/api/projects/${projectId}`
        );
        setPurpose(project.kb_purpose || '');
      } catch (err) {
        setError('Failed to load KB purpose');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadPurpose();
  }, [projectId, fetchJson]);

  const handleSave = async () => {
    if (!projectId) return;

    setSaving(true);
    setError(null);

    try {
      await fetchJson(`/api/projects/${projectId}`, {
        method: 'PATCH',
        body: { kb_purpose: purpose },
      });

      // Show success toast
      showToast({
        message: 'KB purpose saved successfully',
        variant: 'success',
      });
    } catch (err) {
      setError('Failed to save KB purpose');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const charCount = purpose.length;
  const isValid = charCount >= 50 && charCount <= 1000;

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Spinner size="sm" />
        <span>Loading KB purpose...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold text-lg">Knowledge Base Purpose</h3>
          <p className="mt-1 text-sm text-base-content/70">
            Describe what this knowledge base is about. This helps the AI
            discover relevant entity types.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-sm">Preview</span>
            <input
              type="checkbox"
              className="toggle toggle-sm"
              checked={showPreview}
              onChange={(e) => setShowPreview(e.target.checked)}
            />
          </label>
        </div>
      </div>

      {/* Editor / Preview */}
      <div
        className="gap-4 grid grid-cols-1"
        style={{ gridTemplateColumns: showPreview ? '1fr 1fr' : '1fr' }}
      >
        {/* Markdown Editor */}
        <div className="space-y-2">
          <label className="label">
            <span className="label-text">Purpose (Markdown supported)</span>
            <span
              className={`label-text-alt ${
                isValid ? 'text-success' : 'text-warning'
              }`}
            >
              {charCount} / 1000 chars
            </span>
          </label>
          <textarea
            className={`textarea textarea-bordered w-full h-64 font-mono text-sm ${
              !isValid && charCount > 0 ? 'textarea-warning' : ''
            }`}
            placeholder={`Example:

This knowledge base contains customer relationship data for a SaaS business.

**Key Areas:**
- Customer profiles and contact information
- Support tickets and resolution history  
- Feature requests and feedback
- Usage analytics and engagement metrics

The AI should discover entities related to customer management, support operations, and product feedback.`}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
          <div className="text-xs text-base-content/60">
            💡 Tip: Be specific about domains, entities, and relationships you
            expect. Use bullet points for clarity.
          </div>
        </div>

        {/* Preview Panel */}
        {showPreview && (
          <div className="space-y-2">
            <label className="label">
              <span className="label-text">Preview</span>
            </label>
            <div className="bg-base-100 p-4 border border-base-300 rounded-lg h-64 overflow-y-auto">
              {purpose ? (
                <div className="max-w-none prose prose-sm">
                  <ReactMarkdown>{purpose}</ReactMarkdown>
                </div>
              ) : (
                <div className="text-base-content/40 italic">
                  Start typing to see preview...
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Validation & Actions */}
      <div className="flex justify-between items-center">
        <div>
          {error && (
            <div className="alert alert-error alert-sm">
              <span>{error}</span>
            </div>
          )}
          {!isValid && charCount > 0 && (
            <div className="alert alert-warning alert-sm">
              <span>
                {charCount < 50
                  ? `Add ${50 - charCount} more characters (minimum 50)`
                  : `Remove ${charCount - 1000} characters (maximum 1000)`}
              </span>
            </div>
          )}
        </div>

        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={!isValid || saving}
        >
          {saving && <Spinner size="sm" />}
          {saving ? 'Saving...' : 'Save Purpose'}
        </button>
      </div>

      {/* Help Section */}
      <div className="space-y-2 bg-base-200 p-4 rounded-lg">
        <div className="flex items-center gap-2 font-semibold text-sm">
          <span className="text-info iconify lucide--info"></span>
          How Auto-Discovery Uses This
        </div>
        <ul className="space-y-1 text-sm text-base-content/70 list-disc list-inside">
          <li>
            The AI analyzes your documents alongside this purpose description
          </li>
          <li>
            Types and relationships are discovered based on recurring patterns
            that match your purpose
          </li>
          <li>More specific purpose = more accurate entity discovery</li>
          <li>
            You can review and edit all discovered types before installation
          </li>
        </ul>
      </div>
    </div>
  );
};

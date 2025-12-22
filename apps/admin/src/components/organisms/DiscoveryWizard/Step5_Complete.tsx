/**
 * Step 5: Complete
 *
 * Success screen with template pack information and save functionality
 */

import { useState } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { useApi } from '@/hooks/use-api';
import type {
  DiscoveryJob,
  TypeCandidate,
  Relationship,
} from './DiscoveryWizard';
import type { PackConfig } from './Step4_5_ConfigurePack';

interface Step5Props {
  jobData: DiscoveryJob;
  includedTypes: TypeCandidate[];
  includedRelationships: Relationship[];
  packConfig: PackConfig | null;
  onClose: () => void;
  onStartNew: () => void;
}

export function Step5_Complete({
  jobData,
  includedTypes,
  includedRelationships,
  packConfig,
  onClose,
  onStartNew,
}: Step5Props) {
  const { apiBase, fetchJson } = useApi();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPackId, setSavedPackId] = useState<string | null>(null);

  const includedTypeCount = includedTypes.length;
  const totalTypeCount = jobData.discovered_types?.length || 0;
  const includedRelCount = includedRelationships.length;
  const totalRelCount = jobData.discovered_relationships?.length || 0;

  // Create a set of included type names for quick lookup
  const includedTypeNames = new Set(includedTypes.map((t) => t.type_name));

  const handleSavePack = async () => {
    if (!packConfig) {
      setError('Pack configuration is missing');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const response = await fetchJson<{
        template_pack_id: string;
        message: string;
      }>(`${apiBase}/api/discovery-jobs/${jobData.id}/finalize`, {
        method: 'POST',
        body: {
          packName: packConfig.packName,
          mode: packConfig.mode,
          existingPackId: packConfig.existingPackId,
          includedTypes: includedTypes,
          includedRelationships: includedRelationships,
        },
      });

      setSavedPackId(response.template_pack_id);
      setSaved(true);
    } catch (err) {
      console.error('Failed to save template pack:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to save template pack'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col justify-center items-center space-y-6 py-8 text-center">
      {/* Success Icon */}
      <div
        className={`flex justify-center items-center rounded-full w-24 h-24 ${
          saved ? 'bg-success/10' : 'bg-info/10'
        }`}
      >
        <Icon
          icon={saved ? 'lucide--check-circle' : 'lucide--package'}
          className={`size-12 ${saved ? 'text-success' : 'text-info'}`}
        />
      </div>

      {/* Success Message */}
      <div>
        <h3 className="font-bold text-2xl">
          {saved ? 'Template Pack Saved!' : 'Discovery Complete!'}
        </h3>
        <p className="mt-2 text-base-content/70">
          {saved
            ? 'Your template pack has been successfully created and is ready to use.'
            : 'Review your discovery results and save as a template pack.'}
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="w-full max-w-md alert alert-error">
          <Icon icon="lucide--alert-circle" className="size-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary Card */}
      <div className="bg-base-200 p-6 border border-base-300 rounded-lg w-full max-w-md">
        <h4 className="flex items-center gap-2 mb-4 font-semibold">
          <Icon icon="lucide--package" className="size-5" />
          Template Pack Summary
        </h4>

        <div className="space-y-3">
          {/* Pack Name and Mode */}
          {packConfig && (
            <>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2 text-base-content/70">
                  <Icon icon="lucide--tag" className="size-4" />
                  Pack Name
                </span>
                <span className="font-medium">{packConfig.packName}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-2 text-base-content/70">
                  <Icon icon="lucide--folder" className="size-4" />
                  Action
                </span>
                <span className="font-medium">
                  {packConfig.mode === 'create'
                    ? 'Create New Pack'
                    : `Extend Pack (${packConfig.existingPackId?.slice(
                        0,
                        8
                      )}...)`}
                </span>
              </div>
              {saved && savedPackId && (
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-2 text-base-content/70">
                    <Icon icon="lucide--database" className="size-4" />
                    Pack ID
                  </span>
                  <span className="font-mono text-xs truncate">
                    {savedPackId}
                  </span>
                </div>
              )}
              <div className="-mx-1 pt-3 border-base-300 border-t" />
            </>
          )}

          {/* Type Count */}
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-2 text-base-content/70">
              <Icon icon="lucide--layers" className="size-4" />
              Entity Types
            </span>
            <span className="font-medium">
              {includedTypeCount} / {totalTypeCount}
              {includedTypeCount < totalTypeCount && (
                <span className="ml-2 text-warning text-xs">
                  ({totalTypeCount - includedTypeCount} excluded)
                </span>
              )}
            </span>
          </div>

          {/* Relationship Count */}
          <div className="flex justify-between items-center">
            <span className="flex items-center gap-2 text-base-content/70">
              <Icon icon="lucide--git-branch" className="size-4" />
              Relationships
            </span>
            <span className="font-medium">
              {includedRelCount} / {totalRelCount}
              {includedRelCount < totalRelCount && (
                <span className="ml-2 text-warning text-xs">
                  ({totalRelCount - includedRelCount} excluded)
                </span>
              )}
            </span>
          </div>

          {/* Template Pack ID */}
          {jobData.template_pack_id && (
            <div className="pt-3 border-base-300 border-t">
              <div className="flex items-center gap-2 text-sm text-base-content/60">
                <Icon icon="lucide--hash" className="size-4" />
                <code className="truncate">{jobData.template_pack_id}</code>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Type List Preview */}
      {totalTypeCount > 0 && (
        <div className="w-full max-w-md">
          <details className="collapse collapse-arrow bg-base-100 border border-base-300 rounded-lg">
            <summary className="collapse-title font-medium text-sm">
              View Discovered Types ({includedTypeCount} included /{' '}
              {totalTypeCount} total)
            </summary>
            <div className="collapse-content">
              <ul className="space-y-2 text-sm">
                {jobData.discovered_types.map((type, idx) => {
                  const isIncluded = includedTypeNames.has(type.type_name);
                  return (
                    <li
                      key={idx}
                      className={`flex justify-between items-center ${
                        isIncluded ? '' : 'opacity-40 line-through'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {isIncluded ? (
                          <Icon
                            icon="lucide--check-circle"
                            className="size-4 text-success"
                          />
                        ) : (
                          <Icon
                            icon="lucide--x-circle"
                            className="size-4 text-error"
                          />
                        )}
                        <span className="font-medium">{type.type_name}</span>
                      </span>
                      <span className="text-base-content/60">
                        {type.frequency} instances
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </details>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-3 pt-4 w-full max-w-md">
        {!saved && packConfig && (
          <button
            className="gap-2 btn btn-primary"
            onClick={handleSavePack}
            disabled={saving}
          >
            {saving ? (
              <>
                <Spinner size="sm" />
                Saving Pack...
              </>
            ) : (
              <>
                <Icon icon="lucide--save" className="size-4" />
                Save Template Pack
              </>
            )}
          </button>
        )}
        {saved && (
          <div className="bg-success/10 p-4 border border-success/30 rounded-lg">
            <div className="flex items-center gap-2 text-success">
              <Icon icon="lucide--check-circle" className="size-5" />
              <span className="font-medium">Pack saved successfully!</span>
            </div>
            <p className="mt-2 text-sm text-base-content/70">
              Your template pack is now available in your project's template
              library.
            </p>
          </div>
        )}
        <button className="gap-2 btn-outline btn" onClick={onStartNew}>
          <Icon icon="lucide--refresh-cw" className="size-4" />
          Start New Discovery
        </button>
        <button className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>

      {/* Next Steps Card */}
      {!saved && (
        <div className="bg-info/5 p-4 border border-info/30 rounded-lg w-full max-w-md">
          <div className="flex items-start gap-3">
            <Icon icon="lucide--lightbulb" className="size-5 text-info" />
            <div className="text-sm text-left">
              <div className="font-medium text-info">Ready to Save</div>
              <ul className="space-y-1 mt-2 pl-4 text-base-content/70 list-disc">
                <li>Review the types and relationships above</li>
                <li>Click "Save Template Pack" to create your pack</li>
                <li>
                  The pack will be saved to:{' '}
                  <strong>
                    {packConfig?.mode === 'create'
                      ? 'New Pack'
                      : 'Existing Pack'}
                  </strong>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
      {saved && (
        <div className="bg-success/5 p-4 border border-success/30 rounded-lg w-full max-w-md">
          <div className="flex items-start gap-3">
            <Icon icon="lucide--lightbulb" className="size-5 text-success" />
            <div className="text-sm text-left">
              <div className="font-medium text-success">Next Steps</div>
              <ul className="space-y-1 mt-2 pl-4 text-base-content/70 list-disc">
                <li>
                  Install the pack in your project settings to use the types
                </li>
                <li>
                  Start creating instances of your discovered entity types
                </li>
                <li>
                  Run additional discoveries to expand your knowledge graph
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

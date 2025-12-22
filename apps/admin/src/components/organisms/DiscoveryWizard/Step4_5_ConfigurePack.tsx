/**
 * Step 4.5: Configure Template Pack
 *
 * Configure the template pack name and decide whether to create new or extend existing
 */

import { useState, useEffect } from 'react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { useApi } from '@/hooks/use-api';

interface TemplatePack {
  id: string;
  name: string;
  description?: string;
  type_count?: number;
  relationship_count?: number;
}

interface Step4_5Props {
  initialPackName: string;
  onNext: (config: PackConfig) => void;
  onBack: () => void;
}

export interface PackConfig {
  mode: 'create' | 'extend';
  packName: string;
  existingPackId?: string;
}

export function Step4_5_ConfigurePack({
  initialPackName,
  onNext,
  onBack,
}: Step4_5Props) {
  const { apiBase, fetchJson } = useApi();
  const [mode, setMode] = useState<'create' | 'extend'>('create');
  const [packName, setPackName] = useState(initialPackName);
  const [existingPacks, setExistingPacks] = useState<TemplatePack[]>([]);
  const [selectedPackId, setSelectedPackId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load existing template packs
  useEffect(() => {
    const loadPacks = async () => {
      try {
        setLoading(true);
        const response = await fetchJson<{ packs: TemplatePack[] }>(
          `${apiBase}/api/template-packs`
        );

        // API returns { packs: [...], total, page, limit }
        if (response && typeof response === 'object' && 'packs' in response) {
          setExistingPacks(Array.isArray(response.packs) ? response.packs : []);
        } else if (Array.isArray(response)) {
          // Fallback: handle if API returns array directly
          setExistingPacks(response);
        } else {
          console.warn('API returned unexpected response:', response);
          setExistingPacks([]);
        }
      } catch (err) {
        console.error('Failed to load template packs:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load template packs'
        );
        setExistingPacks([]); // Ensure we always have an array
      } finally {
        setLoading(false);
      }
    };

    if (mode === 'extend') {
      loadPacks();
    }
  }, [mode, apiBase, fetchJson]);

  const handleNext = () => {
    if (mode === 'create' && !packName.trim()) {
      setError('Please enter a pack name');
      return;
    }

    if (mode === 'extend' && !selectedPackId) {
      setError('Please select a pack to extend');
      return;
    }

    // Get the selected pack's name when extending
    const finalPackName =
      mode === 'create'
        ? packName.trim()
        : existingPacks.find((p) => p.id === selectedPackId)?.name || '';

    onNext({
      mode,
      packName: finalPackName,
      existingPackId: mode === 'extend' ? selectedPackId : undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="flex items-center gap-2 font-semibold">
          <Icon icon="lucide--package" className="size-5" />
          Configure Template Pack
        </h3>
        <p className="mt-1 text-sm text-base-content/70">
          Choose whether to create a new template pack or extend an existing
          one.
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="alert alert-error">
          <Icon icon="lucide--alert-circle" className="size-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Mode Selection */}
      <div className="space-y-4">
        <label className="font-medium text-sm">Pack Mode</label>

        {/* Create New */}
        <label className="flex items-start gap-3 hover:bg-base-200 p-4 border border-base-300 rounded-lg cursor-pointer">
          <input
            type="radio"
            name="mode"
            value="create"
            checked={mode === 'create'}
            onChange={() => {
              setMode('create');
              setError(null);
            }}
            className="radio radio-primary"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Icon
                icon="lucide--plus-circle"
                className="size-5 text-primary"
              />
              <span className="font-medium">Create New Pack</span>
            </div>
            <p className="mt-1 text-sm text-base-content/60">
              Create a brand new template pack with the discovered types and
              relationships.
            </p>
          </div>
        </label>

        {/* Extend Existing */}
        <label className="flex items-start gap-3 hover:bg-base-200 p-4 border border-base-300 rounded-lg cursor-pointer">
          <input
            type="radio"
            name="mode"
            value="extend"
            checked={mode === 'extend'}
            onChange={() => {
              setMode('extend');
              setError(null);
            }}
            className="radio radio-primary"
          />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Icon icon="lucide--layers" className="size-5 text-secondary" />
              <span className="font-medium">Extend Existing Pack</span>
            </div>
            <p className="mt-1 text-sm text-base-content/60">
              Add discovered types and relationships to an existing template
              pack.
            </p>
          </div>
        </label>
      </div>

      {/* Create Mode: Pack Name Input */}
      {mode === 'create' && (
        <div className="space-y-2">
          <label className="label">
            <span className="font-medium label-text">Pack Name</span>
            <span className="label-text-alt text-error">*</span>
          </label>
          <input
            type="text"
            className="w-full input input-bordered"
            placeholder="e.g., Project Management Types"
            value={packName}
            onChange={(e) => {
              setPackName(e.target.value);
              setError(null);
            }}
            autoFocus
          />
          <label className="label">
            <span className="label-text-alt">
              Give your template pack a descriptive name
            </span>
          </label>
        </div>
      )}

      {/* Extend Mode: Pack Selection */}
      {mode === 'extend' && (
        <div className="space-y-2">
          <label className="label">
            <span className="font-medium label-text">
              Select Pack to Extend
            </span>
            <span className="label-text-alt text-error">*</span>
          </label>

          {loading ? (
            <div className="flex justify-center items-center py-8">
              <Spinner size="md" />
            </div>
          ) : existingPacks.length === 0 ? (
            <div className="flex flex-col justify-center items-center py-8 border border-base-300 rounded-lg text-center">
              <Icon
                icon="lucide--inbox"
                className="size-12 text-base-content/30"
              />
              <p className="mt-2 font-medium text-base-content/60">
                No Template Packs Found
              </p>
              <p className="text-sm text-base-content/50">
                Create a new pack instead
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {Array.isArray(existingPacks) &&
                existingPacks.map((pack) => (
                  <label
                    key={pack.id}
                    className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-base-200 ${
                      selectedPackId === pack.id
                        ? 'border-primary bg-primary/5'
                        : 'border-base-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="selectedPack"
                      value={pack.id}
                      checked={selectedPackId === pack.id}
                      onChange={() => {
                        setSelectedPackId(pack.id);
                        setError(null);
                      }}
                      className="radio radio-primary radio-sm"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{pack.name}</div>
                      {pack.description && (
                        <p className="text-sm text-base-content/60 truncate">
                          {pack.description}
                        </p>
                      )}
                      <div className="flex gap-4 mt-1 text-xs text-base-content/50">
                        {pack.type_count !== undefined && (
                          <span>{pack.type_count} types</span>
                        )}
                        {pack.relationship_count !== undefined && (
                          <span>{pack.relationship_count} relationships</span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Info Card */}
      <div className="bg-info/5 p-4 border border-info/30 rounded-lg">
        <div className="flex items-start gap-3">
          <Icon icon="lucide--info" className="size-5 text-info" />
          <div className="text-sm">
            <div className="font-medium text-info">
              {mode === 'create'
                ? 'Creating a New Pack'
                : 'Extending an Existing Pack'}
            </div>
            <p className="mt-1 text-base-content/70">
              {mode === 'create'
                ? 'Your discovered types and relationships will be packaged into a new reusable template.'
                : 'New types and relationships will be added to the selected pack, complementing existing definitions.'}
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center gap-3 pt-4">
        <button className="btn btn-ghost" onClick={onBack}>
          Back
        </button>
        <button
          className="gap-2 btn btn-primary"
          onClick={handleNext}
          disabled={
            (mode === 'create' && !packName.trim()) ||
            (mode === 'extend' && !selectedPackId)
          }
        >
          <Icon icon="lucide--arrow-right" className="size-4" />
          Generate Template Pack
        </button>
      </div>
    </div>
  );
}

// Page: Project Settings - Template Packs
// Route: /admin/settings/project/templates

import { useEffect, useState } from 'react';
import { useConfig } from '@/contexts/config';
import { useApi } from '@/hooks/use-api';
import { Icon } from '@/components/atoms/Icon';
import { SettingsNav } from './SettingsNav';

interface TemplatePack {
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
    source?: 'manual' | 'discovered' | 'imported' | 'system';
    object_types: Array<{
        type: string;
        description?: string;
        sample_count?: number;
    }>;
    relationship_types: string[];
    relationship_count: number;
    installed: boolean;
    compatible: boolean;
    published_at: string;
}

interface InstalledPack {
    id: string;
    template_pack: {
        id: string;
        name: string;
        version: string;
        description?: string;
        source?: 'manual' | 'discovered' | 'imported' | 'system';
        object_types: Array<{
            type: string;
            description?: string;
        }>;
    };
    installed_at: string;
    installed_by: string;
    active: boolean;
    customizations?: {
        enabledTypes?: string[];
        disabledTypes?: string[];
    };
}

export default function ProjectTemplatesSettingsPage() {
    const { config } = useConfig();
    const { apiBase, fetchJson } = useApi();

    const [availablePacks, setAvailablePacks] = useState<TemplatePack[]>([]);
    const [installedPacks, setInstalledPacks] = useState<InstalledPack[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [installing, setInstalling] = useState<string | null>(null);
    const [selectedPreview, setSelectedPreview] = useState<TemplatePack | null>(null);
    const [showCompiledPreview, setShowCompiledPreview] = useState(false);
    const [compiledTypes, setCompiledTypes] = useState<Record<string, any>>({});

    const loadTemplatePacks = async () => {
        if (!config.activeProjectId) return;

        setLoading(true);
        setError(null);

        try {
            // Load available and installed packs in parallel
            const [available, installed] = await Promise.all([
                fetchJson<TemplatePack[]>(
                    `${apiBase}/api/template-packs/projects/${config.activeProjectId}/available`
                ),
                fetchJson<InstalledPack[]>(
                    `${apiBase}/api/template-packs/projects/${config.activeProjectId}/installed`
                ),
            ]);

            setAvailablePacks(available || []);
            setInstalledPacks(installed || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load template packs');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadTemplatePacks();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.activeProjectId]);

    const loadCompiledTypes = async () => {
        if (!config.activeProjectId) return;

        try {
            const compiled = await fetchJson<Record<string, any>>(
                `${apiBase}/api/template-packs/projects/${config.activeProjectId}/compiled-types`
            );
            setCompiledTypes(compiled || {});
            setShowCompiledPreview(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load compiled types');
        }
    };

    const handleInstall = async (packId: string) => {
        if (!config.activeProjectId) return;

        setInstalling(packId);
        setError(null);

        try {
            await fetchJson(`${apiBase}/api/template-packs/projects/${config.activeProjectId}/assign`, {
                method: 'POST',
                body: {
                    template_pack_id: packId,
                    customizations: {
                        enabledTypes: [], // Enable all by default
                        disabledTypes: [],
                    },
                },
            });

            // Reload packs
            await loadTemplatePacks();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to install template pack');
        } finally {
            setInstalling(null);
        }
    };

    const handleUninstall = async (assignmentId: string) => {
        if (!config.activeProjectId) return;
        if (!window.confirm('Are you sure you want to uninstall this template pack? Existing objects will not be deleted but won\'t appear in type filters.')) {
            return;
        }

        setError(null);

        try {
            await fetchJson(`${apiBase}/api/template-packs/projects/${config.activeProjectId}/assignments/${assignmentId}`, {
                method: 'DELETE',
            });

            // Reload packs
            await loadTemplatePacks();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to uninstall template pack');
        }
    };

    const handleToggleActive = async (assignmentId: string, currentActive: boolean) => {
        if (!config.activeProjectId) return;

        try {
            await fetchJson(`${apiBase}/api/template-packs/projects/${config.activeProjectId}/assignments/${assignmentId}`, {
                method: 'PATCH',
                body: {
                    active: !currentActive,
                },
            });

            // Reload packs
            await loadTemplatePacks();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update template pack');
        }
    };

    const handleDelete = async (packId: string, packName: string) => {
        if (!window.confirm(`Are you sure you want to permanently delete "${packName}"? This action cannot be undone.`)) {
            return;
        }

        setError(null);

        try {
            await fetchJson(`${apiBase}/api/template-packs/${packId}`, {
                method: 'DELETE',
            });

            // Reload packs
            await loadTemplatePacks();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete template pack');
        }
    };

    if (!config.activeProjectId) {
        return (
            <div className="mx-auto container">
                <div className="alert alert-warning">
                    <Icon icon="lucide--alert-triangle" className="size-5" />
                    <span>Please select a project to manage template packs</span>
                </div>
            </div>
        );
    }

    return (
        <div data-testid="page-settings-project-templates" className="mx-auto max-w-6xl container">
            {/* Settings Navigation */}
            <SettingsNav />

            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="font-bold text-2xl">Object Template Packs</h1>
                    <p className="mt-1 text-base-content/70">
                        Template packs define the types of structured objects you can create and extract from documents
                    </p>
                </div>
                {installedPacks.length > 0 && (
                    <button
                        className="btn-outline btn btn-sm"
                        onClick={loadCompiledTypes}
                        data-testid="preview-compiled-types-button"
                    >
                        <Icon icon="lucide--eye" className="size-4" />
                        Preview All Types
                    </button>
                )}
            </div>

            {/* Error Alert */}
            {error && (
                <div role="alert" className="mb-4 alert alert-error">
                    <Icon icon="lucide--alert-circle" className="size-5" />
                    <span>{error}</span>
                    <button
                        className="btn btn-sm btn-ghost"
                        onClick={() => setError(null)}
                        aria-label="Dismiss error"
                    >
                        <Icon icon="lucide--x" className="size-4" />
                    </button>
                </div>
            )}

            {/* Loading State */}
            {loading ? (
                <div className="flex justify-center items-center py-12">
                    <span className="loading loading-spinner loading-lg"></span>
                </div>
            ) : (
                <div className="space-y-8">
                    {/* Installed Template Packs */}
                    <section>
                        <h2 className="mb-4 font-semibold text-xl">Installed Template Packs</h2>
                        {installedPacks.length === 0 ? (
                            <div className="bg-base-200 card">
                                <div className="py-12 text-center card-body">
                                    <Icon icon="lucide--package" className="opacity-50 mx-auto mb-3 size-12" />
                                    <p className="text-base-content/70">No template packs installed yet</p>
                                    <p className="text-sm text-base-content/60">Browse available packs below to get started</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {installedPacks.map((pack, index) => (
                                    <div key={pack.id || `pack-${index}`} className="bg-base-100 border border-base-300 card">
                                        <div className="card-body">
                                            <div className="flex justify-between items-start gap-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3">
                                                        <Icon icon="lucide--check-circle" className="size-5 text-success" />
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="font-semibold text-lg">
                                                                    {pack.template_pack.name}
                                                                </h3>
                                                                {pack.template_pack.source === 'system' && (
                                                                    <span className="badge badge-info badge-sm">Built-in</span>
                                                                )}
                                                                {pack.template_pack.source === 'discovered' && (
                                                                    <span className="badge badge-secondary badge-sm">Discovered</span>
                                                                )}
                                                            </div>
                                                            <p className="text-sm text-base-content/60">
                                                                v{pack.template_pack.version}
                                                            </p>
                                                        </div>
                                                        {!pack.active && (
                                                            <span className="badge badge-warning badge-sm">Disabled</span>
                                                        )}
                                                    </div>
                                                    {pack.template_pack.description && (
                                                        <p className="mt-2 text-sm text-base-content/70">
                                                            {pack.template_pack.description}
                                                        </p>
                                                    )}
                                                    <div className="flex items-center gap-4 mt-3 text-sm text-base-content/60">
                                                        <span>
                                                            {pack.template_pack.object_types?.length || 0} object types
                                                        </span>
                                                        <span>•</span>
                                                        <span>
                                                            Installed {new Date(pack.installed_at).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        className="btn btn-sm btn-ghost"
                                                        onClick={() => handleToggleActive(pack.id, pack.active)}
                                                        title={pack.active ? 'Disable pack' : 'Enable pack'}
                                                    >
                                                        <Icon
                                                            icon={pack.active ? 'lucide--pause' : 'lucide--play'}
                                                            className="size-4"
                                                        />
                                                        {pack.active ? 'Disable' : 'Enable'}
                                                    </button>
                                                    {pack.template_pack.source !== 'system' && (
                                                        <button
                                                            className="btn-outline btn btn-sm btn-error"
                                                            onClick={() => handleUninstall(pack.id)}
                                                        >
                                                            <Icon icon="lucide--trash-2" className="size-4" />
                                                            Remove
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Available Template Packs */}
                    <section>
                        <h2 className="mb-4 font-semibold text-xl">Available Template Packs</h2>

                        {/* Built-in Packs */}
                        {availablePacks.filter((pack) => !pack.installed && pack.source === 'system').length > 0 && (
                            <div className="mb-6">
                                <h3 className="flex items-center gap-2 mb-3 font-medium text-base">
                                    <Icon icon="lucide--shield-check" className="size-5 text-info" />
                                    Built-in Packs
                                </h3>
                                <div className="space-y-3">
                                    {availablePacks
                                        .filter((pack) => !pack.installed && pack.source === 'system')
                                        .map((pack) => (
                                            <div key={pack.id} className="bg-base-100 border border-base-300 hover:border-info/30 transition-colors card">
                                                <div className="card-body">
                                                    <div className="flex items-start gap-3">
                                                        <Icon icon="lucide--package" className="mt-1 size-6 text-info" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="font-semibold">{pack.name}</h3>
                                                                <span className="badge badge-info badge-xs">Built-in</span>
                                                            </div>
                                                            <p className="text-sm text-base-content/60">v{pack.version}</p>
                                                            {pack.description && (
                                                                <p className="mt-2 text-sm text-base-content/70 line-clamp-2">
                                                                    {pack.description}
                                                                </p>
                                                            )}
                                                            <div className="flex items-center gap-2 mt-3 text-sm text-base-content/60">
                                                                <span>{pack.object_types?.length || 0} object types</span>
                                                                <span>•</span>
                                                                <span>{pack.relationship_count || 0} relationships</span>
                                                                {pack.author && (
                                                                    <>
                                                                        <span>•</span>
                                                                        <span>by {pack.author}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="justify-end mt-4 card-actions">
                                                        <button
                                                            className="btn btn-sm btn-ghost"
                                                            onClick={() => setSelectedPreview(pack)}
                                                        >
                                                            <Icon icon="lucide--eye" className="size-4" />
                                                            Preview
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-primary"
                                                            onClick={() => handleInstall(pack.id)}
                                                            disabled={installing === pack.id}
                                                        >
                                                            {installing === pack.id ? (
                                                                <>
                                                                    <span className="loading loading-spinner loading-xs"></span>
                                                                    Installing...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Icon icon="lucide--download" className="size-4" />
                                                                    Install
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}

                        {/* User Created & Discovered Packs */}
                        {availablePacks.filter((pack) => !pack.installed && pack.source !== 'system').length > 0 && (
                            <div>
                                <h3 className="flex items-center gap-2 mb-3 font-medium text-base">
                                    <Icon icon="lucide--user" className="size-5 text-primary" />
                                    User Created & Discovered Packs
                                </h3>
                                <div className="space-y-3">
                                    {availablePacks
                                        .filter((pack) => !pack.installed && pack.source !== 'system')
                                        .map((pack) => (
                                            <div key={pack.id} className="bg-base-100 border border-base-300 hover:border-primary/30 transition-colors card">
                                                <div className="card-body">
                                                    <div className="flex items-start gap-3">
                                                        <Icon icon="lucide--package" className="mt-1 size-6 text-primary" />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2">
                                                                <h3 className="font-semibold">{pack.name}</h3>
                                                                {pack.source === 'discovered' && (
                                                                    <span className="badge badge-secondary badge-xs">Discovered</span>
                                                                )}
                                                            </div>
                                                            <p className="text-sm text-base-content/60">v{pack.version}</p>
                                                            {pack.description && (
                                                                <p className="mt-2 text-sm text-base-content/70 line-clamp-2">
                                                                    {pack.description}
                                                                </p>
                                                            )}
                                                            <div className="flex items-center gap-2 mt-3 text-sm text-base-content/60">
                                                                <span>{pack.object_types?.length || 0} object types</span>
                                                                <span>•</span>
                                                                <span>{pack.relationship_count || 0} relationships</span>
                                                                {pack.author && (
                                                                    <>
                                                                        <span>•</span>
                                                                        <span>by {pack.author}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="justify-end mt-4 card-actions">
                                                        <button
                                                            className="btn btn-sm btn-ghost"
                                                            onClick={() => setSelectedPreview(pack)}
                                                        >
                                                            <Icon icon="lucide--eye" className="size-4" />
                                                            Preview
                                                        </button>
                                                        <button
                                                            className="btn-outline btn btn-sm btn-error"
                                                            onClick={() => handleDelete(pack.id, pack.name)}
                                                            title="Permanently delete this template pack"
                                                        >
                                                            <Icon icon="lucide--trash-2" className="size-4" />
                                                            Delete
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-primary"
                                                            onClick={() => handleInstall(pack.id)}
                                                            disabled={installing === pack.id}
                                                        >
                                                            {installing === pack.id ? (
                                                                <>
                                                                    <span className="loading loading-spinner loading-xs"></span>
                                                                    Installing...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Icon icon="lucide--download" className="size-4" />
                                                                    Install
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}

                        {availablePacks.filter((p) => !p.installed).length === 0 && installedPacks.length > 0 && (
                            <div className="bg-base-200 card">
                                <div className="py-8 text-center card-body">
                                    <Icon icon="lucide--package-check" className="opacity-50 mx-auto mb-2 size-10" />
                                    <p className="text-base-content/70">All available template packs are installed</p>
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            )}

            {/* Preview Modal */}
            {selectedPreview && (
                <dialog className="modal modal-open">
                    <div className="max-w-2xl modal-box">
                        <form method="dialog">
                            <button
                                className="top-2 right-2 absolute btn btn-sm btn-circle btn-ghost"
                                onClick={() => setSelectedPreview(null)}
                            >
                                ✕
                            </button>
                        </form>
                        <h3 className="mb-4 font-bold text-lg">
                            {selectedPreview.name} v{selectedPreview.version}
                        </h3>
                        {selectedPreview.description && (
                            <p className="mb-4 text-base-content/70">{selectedPreview.description}</p>
                        )}

                        <div className="divider">Object Types ({selectedPreview.object_types?.length || 0})</div>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {selectedPreview.object_types?.map((type) => (
                                <div key={type.type} className="bg-base-200 p-3 rounded">
                                    <div className="font-medium">{type.type}</div>
                                    {type.description && (
                                        <div className="mt-1 text-sm text-base-content/70">{type.description}</div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {selectedPreview.relationship_types && selectedPreview.relationship_types.length > 0 && (
                            <>
                                <div className="divider">Relationship Types ({selectedPreview.relationship_types.length})</div>
                                <div className="flex flex-wrap gap-2">
                                    {selectedPreview.relationship_types.map((rel, index) => (
                                        <span key={`${rel}-${index}`} className="badge-outline badge">
                                            {rel}
                                        </span>
                                    ))}
                                </div>
                            </>
                        )}

                        <div className="modal-action">
                            <button className="btn btn-ghost" onClick={() => setSelectedPreview(null)}>
                                Close
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    handleInstall(selectedPreview.id);
                                    setSelectedPreview(null);
                                }}
                                disabled={installing === selectedPreview.id}
                            >
                                {installing === selectedPreview.id ? (
                                    <>
                                        <span className="loading loading-spinner loading-xs"></span>
                                        Installing...
                                    </>
                                ) : (
                                    'Install Template Pack'
                                )}
                            </button>
                        </div>
                    </div>
                </dialog>
            )}

            {/* Compiled Types Preview Modal */}
            {showCompiledPreview && (
                <dialog className="modal modal-open" data-testid="compiled-types-modal">
                    <div className="max-w-4xl modal-box">
                        <form method="dialog">
                            <button
                                className="top-2 right-2 absolute btn btn-sm btn-circle btn-ghost"
                                onClick={() => setShowCompiledPreview(false)}
                            >
                                ✕
                            </button>
                        </form>
                        <h3 className="mb-2 font-bold text-lg">Compiled Object Types</h3>
                        <p className="mb-4 text-sm text-base-content/70">
                            All object types from installed template packs, merged and ready for extraction
                        </p>

                        {Object.keys(compiledTypes).length === 0 ? (
                            <div className="bg-base-200 py-8 text-center card">
                                <Icon icon="lucide--inbox" className="opacity-50 mx-auto mb-2 size-10" />
                                <p className="text-base-content/70">No object types installed</p>
                            </div>
                        ) : (
                            <>
                                <div className="divider">Object Types ({Object.keys(compiledTypes).length})</div>
                                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                                    {Object.entries(compiledTypes).map(([typeName, schema]) => (
                                        <div key={typeName} className="bg-base-200 p-4 rounded">
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className="font-semibold text-base">{typeName}</h4>
                                                {schema._sources && schema._sources.length > 0 && (
                                                    <div className="flex flex-wrap justify-end gap-1">
                                                        {schema._sources.map((source: any, idx: number) => (
                                                            <span
                                                                key={idx}
                                                                className="badge badge-sm badge-ghost"
                                                                title={`From: ${source.pack} v${source.version}`}
                                                            >
                                                                {source.pack}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            {schema.description && (
                                                <p className="mt-2 mb-3 text-sm text-base-content/70">{schema.description}</p>
                                            )}
                                            {schema.properties && Object.keys(schema.properties).length > 0 && (
                                                <div className="mt-3">
                                                    <div className="mb-2 font-medium text-sm">Properties:</div>
                                                    <div className="space-y-1">
                                                        {Object.entries(schema.properties).map(([propName, propDef]: [string, any]) => (
                                                            <div key={propName} className="bg-base-100 px-3 py-2 rounded text-xs">
                                                                <span className="font-mono font-medium">{propName}</span>
                                                                {schema.required?.includes(propName) && (
                                                                    <span className="ml-2 badge badge-xs badge-error">required</span>
                                                                )}
                                                                {propDef.type && (
                                                                    <span className="ml-2 text-base-content/60">
                                                                        {propDef.type}
                                                                    </span>
                                                                )}
                                                                {propDef.description && (
                                                                    <div className="mt-1 text-base-content/60">
                                                                        {propDef.description}
                                                                    </div>
                                                                )}
                                                                {propDef.enum && (
                                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                                        {propDef.enum.map((val: string) => (
                                                                            <span key={val} className="badge badge-xs">
                                                                                {val}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {schema.examples && schema.examples.length > 0 && (
                                                <div className="mt-3">
                                                    <div className="mb-2 font-medium text-sm">Examples:</div>
                                                    <div className="space-y-2">
                                                        {schema.examples.map((example: any, idx: number) => (
                                                            <div key={idx} className="bg-base-100 p-2 rounded">
                                                                <pre className="overflow-x-auto font-mono text-xs">
                                                                    {JSON.stringify(example, null, 2)}
                                                                </pre>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        <div className="modal-action">
                            <button className="btn btn-ghost" onClick={() => setShowCompiledPreview(false)}>
                                Close
                            </button>
                        </div>
                    </div>
                </dialog>
            )}
        </div>
    );
}

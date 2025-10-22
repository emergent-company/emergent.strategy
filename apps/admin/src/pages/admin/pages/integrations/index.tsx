import { useEffect, useState, useMemo } from "react";
import { Icon } from "@/components/atoms/Icon";
import { LoadingEffect } from "@/components";
import { useApi } from "@/hooks/use-api";
import { useConfig } from "@/contexts/config";
import { OrgAndProjectGate } from "@/components/organisms/OrgAndProjectGate";
import { createIntegrationsClient, type AvailableIntegration, type Integration } from "@/api/integrations";
import { IntegrationCard } from "./IntegrationCard";
import { ConfigureIntegrationModal } from "./ConfigureIntegrationModal";
import { ClickUpSyncModal } from "./clickup/ClickUpSyncModal";

export default function IntegrationsPage() {
    const { apiBase, fetchJson } = useApi();
    const { config } = useConfig();
    const [availableIntegrations, setAvailableIntegrations] = useState<AvailableIntegration[]>([]);
    const [configuredIntegrations, setConfiguredIntegrations] = useState<Integration[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedIntegration, setSelectedIntegration] = useState<AvailableIntegration | null>(null);
    const [configuredInstance, setConfiguredInstance] = useState<Integration | null>(null);
    const [syncModalOpen, setSyncModalOpen] = useState(false);
    const [syncIntegration, setSyncIntegration] = useState<string | null>(null);

    const integrationsClient = useMemo(() => createIntegrationsClient(
        apiBase,
        fetchJson,
        config.activeProjectId,
        config.activeOrgId
    ), [apiBase, fetchJson, config.activeProjectId, config.activeOrgId]);

    // Load available and configured integrations
    useEffect(() => {
        let cancelled = false;

        if (!config.activeOrgId || !config.activeProjectId) {
            return () => {
                cancelled = true;
            };
        }

        async function load() {
            setLoading(true);
            setError(null);

            try {
                const [available, configured] = await Promise.all([
                    integrationsClient.listAvailable(),
                    integrationsClient.listIntegrations(),
                ]);

                if (!cancelled) {
                    setAvailableIntegrations(available);
                    setConfiguredIntegrations(configured);
                }
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : "Failed to load integrations";
                if (!cancelled) {
                    setError(msg);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        load();

        return () => {
            cancelled = true;
        };
    }, [integrationsClient, config.activeOrgId, config.activeProjectId]);

    const handleConfigure = (integration: AvailableIntegration) => {
        // Find if this integration is already configured
        const existing = configuredIntegrations.find(c => c.name === integration.name);
        setSelectedIntegration(integration);
        setConfiguredInstance(existing || null);
    };

    const handleCloseModal = () => {
        setSelectedIntegration(null);
        setConfiguredInstance(null);
    };

    const handleSaveSuccess = () => {
        // Reload integrations
        integrationsClient.listIntegrations().then(configured => {
            setConfiguredIntegrations(configured);
        });
        handleCloseModal();
    };

    const handleToggle = async (integration: Integration) => {
        try {
            await integrationsClient.updateIntegration(integration.name, {
                enabled: !integration.enabled,
            });
            // Reload integrations
            const configured = await integrationsClient.listIntegrations();
            setConfiguredIntegrations(configured);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Failed to toggle integration";
            setError(msg);
        }
    };

    const handleDelete = async (integration: Integration) => {
        if (!confirm(`Are you sure you want to delete the ${integration.display_name} integration?`)) {
            return;
        }

        try {
            await integrationsClient.deleteIntegration(integration.name);
            // Reload integrations
            const configured = await integrationsClient.listIntegrations();
            setConfiguredIntegrations(configured);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Failed to delete integration";
            setError(msg);
        }
    };

    const handleSync = (integration: AvailableIntegration) => {
        setSyncIntegration(integration.name);
        setSyncModalOpen(true);
    };

    const handleSyncSuccess = async () => {
        // Reload integrations to show updated last_sync status
        try {
            const configured = await integrationsClient.listIntegrations();
            setConfiguredIntegrations(configured);
        } catch (e: unknown) {
            console.error('Failed to reload integrations:', e);
        }
    };

    const handleSyncClose = () => {
        setSyncModalOpen(false);
        setSyncIntegration(null);
    };

    return (
        <OrgAndProjectGate>
            <div data-testid="page-integrations" className="mx-auto p-6 max-w-7xl container">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="font-bold text-2xl">Integrations</h1>
                    <p className="mt-1 text-base-content/70">
                        Connect external tools and services to sync data with your knowledge base
                    </p>
                </div>

                {/* Error Alert */}
                {error && (
                    <div className="alert alert-error">
                        <Icon icon="lucide--alert-circle" className="w-5 h-5" />
                        <span>{error}</span>
                        <button
                            className="btn btn-sm btn-ghost"
                            onClick={() => setError(null)}
                        >
                            <Icon icon="lucide--x" className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Loading State */}
                {loading && (
                    <div className="flex justify-center items-center py-20">
                        <LoadingEffect />
                    </div>
                )}

                {/* Integrations Grid */}
                {!loading && availableIntegrations.length > 0 && (
                    <div className="gap-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                        {availableIntegrations.map(integration => {
                            const configured = configuredIntegrations.find(
                                c => c.name === integration.name
                            );

                            return (
                                <IntegrationCard
                                    key={integration.name}
                                    integration={integration}
                                    configuredInstance={configured}
                                    onConfigure={() => handleConfigure(integration)}
                                    onToggle={configured ? () => handleToggle(configured) : undefined}
                                    onDelete={configured ? () => handleDelete(configured) : undefined}
                                    onSync={configured ? () => handleSync(integration) : undefined}
                                    data-testid={integration.name === 'clickup' ? 'integration-card-clickup' : undefined}
                                />
                            );
                        })}
                    </div>
                )}

                {/* Empty State */}
                {!loading && availableIntegrations.length === 0 && (
                    <div className="bg-base-200 shadow-sm card">
                        <div className="items-center py-20 text-center card-body">
                            <Icon
                                icon="lucide--plug"
                                className="mb-4 w-16 h-16 text-base-content/30"
                            />
                            <h3 className="mb-2 font-semibold text-xl">No integrations available</h3>
                            <p className="text-base-content/70">
                                Integration plugins will appear here once they are registered.
                            </p>
                        </div>
                    </div>
                )}

                {/* Configuration Modal */}
                {selectedIntegration && (
                    <ConfigureIntegrationModal
                        integration={selectedIntegration}
                        configuredInstance={configuredInstance}
                        onClose={handleCloseModal}
                        onSuccess={handleSaveSuccess}
                        client={integrationsClient}
                        orgId={config.activeOrgId}
                        projectId={config.activeProjectId}
                        data-testid={selectedIntegration.name === 'clickup' ? 'clickup-config-modal' : undefined}
                    />
                )}

                {/* Sync Modal */}
                {syncModalOpen && syncIntegration === 'clickup' && (
                    <ClickUpSyncModal
                        client={integrationsClient}
                        onClose={handleSyncClose}
                        onSuccess={handleSyncSuccess}
                    />
                )}
            </div>
        </OrgAndProjectGate>
    );
}

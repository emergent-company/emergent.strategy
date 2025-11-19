import { type ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { useNotificationCounts } from '@/hooks/useNotifications';
import { useExtractionJobsCount } from '@/hooks/useExtractionJobsCount';
import { useConfig } from '@/contexts/config';
import { useOrganizations } from '@/hooks/use-organizations';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';
import { useAccessTreeContext } from '@/contexts/access-tree';

import { Footer } from '@/components/organisms/Footer';
import { Rightbar } from '@/components/organisms/Rightbar';
import { Sidebar } from '@/components/organisms/Sidebar';
import { Topbar } from '@/components/organisms/Topbar';
import { Modal } from '@/components/organisms/Modal/Modal';
import { Icon } from '@/components/atoms/Icon';

import { OrgAndProjectGateRedirect } from '@/components/organisms/OrgAndProjectGate';

const AdminLayout = ({ children }: { children: ReactNode }) => {
  const { ensureAuthenticated, isAuthenticated } = useAuth();
  const { data: notificationCounts } = useNotificationCounts();
  const { counts: extractionJobsCounts } = useExtractionJobsCount();
  const { config, setActiveProject, setActiveOrg } = useConfig();
  const { createOrg } = useOrganizations();
  const { showToast } = useToast();
  const { apiBase, fetchJson } = useApi();
  const { refresh: refreshTree } = useAccessTreeContext();

  // Modal states
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [targetOrgId, setTargetOrgId] = useState<string | undefined>(undefined);
  const [targetOrgName, setTargetOrgName] = useState<string | undefined>(
    undefined
  );

  useEffect(() => {
    ensureAuthenticated();
  }, [ensureAuthenticated]);

  const handleCreateOrg = async () => {
    if (!orgName.trim()) return;
    try {
      setCreating(true);
      setError(undefined);
      const created = await createOrg(orgName.trim());
      setActiveOrg(created.id, created.name);
      setOrgName('');
      setShowOrgModal(false);
      showToast({
        message: `Organization "${created.name}" created`,
        variant: 'success',
        duration: 2500,
      });
    } catch (e) {
      setError((e as Error).message || 'Failed to create organization');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateProject = async () => {
    if (!projectName.trim() || !targetOrgId) return;
    try {
      setCreating(true);
      setError(undefined);

      // Call API directly to create project in specific org
      const created = await fetchJson<
        { id: string; name: string; orgId: string },
        { name: string; orgId: string }
      >(`${apiBase}/api/projects`, {
        method: 'POST',
        body: { name: projectName.trim(), orgId: targetOrgId },
        credentials: 'include',
      });

      // Set as active and refresh tree
      await refreshTree();
      setActiveOrg(targetOrgId, targetOrgName || '');
      setActiveProject(created.id, created.name);
      setProjectName('');
      setShowProjectModal(false);
      showToast({
        message: `Project "${created.name}" created`,
        variant: 'success',
        duration: 2500,
      });
    } catch (e) {
      setError((e as Error).message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const handleCloseOrgModal = () => {
    setShowOrgModal(false);
    setOrgName('');
    setError(undefined);
  };

  const handleCloseProjectModal = () => {
    setShowProjectModal(false);
    setProjectName('');
    setError(undefined);
    setTargetOrgId(undefined);
    setTargetOrgName(undefined);
  };

  if (!isAuthenticated) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  // Calculate total unread notifications
  const totalUnread =
    (notificationCounts?.important || 0) + (notificationCounts?.other || 0);

  return (
    <div className="size-full">
      <div className="flex">
        <Sidebar>
          <Sidebar.ProjectDropdown
            activeProjectId={config.activeProjectId}
            activeProjectName={config.activeProjectName}
            onSelectProject={(
              projectId: string,
              projectName: string,
              orgId: string,
              orgName: string
            ) => {
              // Always set org first to ensure proper context
              // setActiveOrg clears projectId, then we set it explicitly
              if (orgId !== config.activeOrgId) {
                setActiveOrg(orgId, orgName);
              }
              setActiveProject(projectId, projectName);
            }}
            onAddOrganization={() => setShowOrgModal(true)}
            onAddProject={(orgId: string, orgName: string) => {
              setTargetOrgId(orgId);
              setTargetOrgName(orgName);
              setShowProjectModal(true);
            }}
          />
          <Sidebar.Section id="admin-primary" title="Overview">
            <Sidebar.MenuItem
              id="apps-documents"
              url="/admin/apps/documents"
              icon="lucide--file-text"
            >
              Documents
            </Sidebar.MenuItem>
            <Sidebar.MenuItem
              id="apps-chunks"
              url="/admin/apps/chunks"
              icon="lucide--square-stack"
            >
              Chunks
            </Sidebar.MenuItem>
            <Sidebar.MenuItem
              id="apps-objects"
              url="/admin/objects"
              icon="lucide--box"
            >
              Objects
            </Sidebar.MenuItem>
            <Sidebar.MenuItem
              id="extraction-jobs"
              url="/admin/extraction-jobs"
              icon="lucide--workflow"
              badges={
                extractionJobsCounts.total > 0
                  ? [
                      {
                        label:
                          extractionJobsCounts.total > 99
                            ? '99+'
                            : extractionJobsCounts.total.toString(),
                        variant:
                          extractionJobsCounts.running > 0 ? 'info' : 'warning',
                      },
                    ]
                  : undefined
              }
            >
              Extraction Jobs
            </Sidebar.MenuItem>
            <Sidebar.MenuItem
              id="admin-chat"
              url="/admin/apps/chat"
              icon="lucide--message-square"
            >
              Chat
            </Sidebar.MenuItem>
            <Sidebar.MenuItem
              id="admin-inbox"
              url="/admin/inbox"
              icon="lucide--inbox"
              badges={
                totalUnread > 0
                  ? [
                      {
                        label:
                          totalUnread > 99 ? '99+' : totalUnread.toString(),
                        variant: notificationCounts?.important
                          ? 'primary'
                          : 'neutral',
                      },
                    ]
                  : undefined
              }
            >
              Inbox
            </Sidebar.MenuItem>
          </Sidebar.Section>
          <Sidebar.Section
            id="admin-settings"
            title="Settings"
            className="mt-4"
          >
            <Sidebar.MenuItem
              id="admin-integrations"
              url="/admin/integrations"
              icon="lucide--plug"
            >
              Integrations
            </Sidebar.MenuItem>
            <Sidebar.MenuItem
              id="admin-settings-project"
              url="/admin/settings/project"
              icon="lucide--settings"
            >
              Project Settings
            </Sidebar.MenuItem>
            <Sidebar.MenuItem
              id="admin-settings-ai-prompts"
              url="/admin/settings/ai/prompts"
              icon="lucide--book-text"
            >
              AI Prompts
            </Sidebar.MenuItem>
          </Sidebar.Section>
          <Sidebar.Section
            id="admin-monitoring"
            title="System Monitoring"
            className="mt-4"
          >
            <Sidebar.MenuItem
              id="admin-monitoring-dashboard"
              url="/admin/monitoring/dashboard"
              icon="lucide--activity"
            >
              Dashboard
            </Sidebar.MenuItem>
          </Sidebar.Section>
        </Sidebar>
        <div className="flex flex-col min-w-0 h-screen overflow-auto grow">
          <Topbar />
          <div id="layout-content" className="flex-1 overflow-auto">
            <OrgAndProjectGateRedirect>{children}</OrgAndProjectGateRedirect>
          </div>
          <Footer />
        </div>
      </div>
      <Rightbar />

      {/* Create Organization Modal */}
      <Modal
        open={showOrgModal}
        onOpenChange={(open) => !open && handleCloseOrgModal()}
        title="Create Organization"
        sizeClassName="max-w-md"
        actions={[
          {
            label: 'Cancel',
            variant: 'ghost',
            onClick: handleCloseOrgModal,
          },
          {
            label: creating ? 'Creating...' : 'Create',
            variant: 'primary',
            disabled: creating || !orgName.trim(),
            onClick: handleCreateOrg,
            autoFocus: true,
          },
        ]}
      >
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-error/10 text-error text-sm flex items-center gap-2">
            <Icon icon="lucide--alert-triangle" className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div>
          <label htmlFor="org-name-input" className="label">
            <span className="label-text">Organization name</span>
          </label>
          <input
            id="org-name-input"
            type="text"
            className="input input-bordered w-full"
            placeholder="Acme Inc"
            value={orgName}
            maxLength={100}
            onChange={(e) => setOrgName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && orgName.trim() && !creating) {
                handleCreateOrg();
              }
            }}
          />
        </div>
      </Modal>

      {/* Create Project Modal */}
      <Modal
        open={showProjectModal}
        onOpenChange={(open) => !open && handleCloseProjectModal()}
        title={
          targetOrgName
            ? `Create Project in ${targetOrgName}`
            : 'Create Project'
        }
        sizeClassName="max-w-md"
        actions={[
          {
            label: 'Cancel',
            variant: 'ghost',
            onClick: handleCloseProjectModal,
          },
          {
            label: creating ? 'Creating...' : 'Create',
            variant: 'primary',
            disabled: creating || !projectName.trim(),
            onClick: handleCreateProject,
            autoFocus: true,
          },
        ]}
      >
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-error/10 text-error text-sm flex items-center gap-2">
            <Icon icon="lucide--alert-triangle" className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div>
          <label htmlFor="project-name-input" className="label">
            <span className="label-text">Project name</span>
          </label>
          <input
            id="project-name-input"
            type="text"
            className="input input-bordered w-full"
            placeholder="My Project"
            value={projectName}
            maxLength={100}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && projectName.trim() && !creating) {
                handleCreateProject();
              }
            }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default AdminLayout;

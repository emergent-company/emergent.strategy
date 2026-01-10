import { type ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/useAuth';
import { useNotificationCounts } from '@/hooks/useNotifications';
import { useTaskCounts, useAllTaskCounts } from '@/hooks/useTasks';

import { useConfig } from '@/contexts/config';
import { useOrganizations } from '@/hooks/use-organizations';
import { useToast } from '@/hooks/use-toast';
import { useApi } from '@/hooks/use-api';
import { useAccessTreeContext } from '@/contexts/access-tree';
import { useSuperadmin } from '@/hooks/use-superadmin';
import { useSourceTypes } from '@/hooks/use-source-types';

import { Footer } from '@/components/organisms/Footer';
import { Rightbar } from '@/components/organisms/Rightbar';
import { Sidebar } from '@/components/organisms/Sidebar';
import { Topbar } from '@/components/organisms/Topbar';
import { Modal } from '@/components/organisms/Modal/Modal';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';

import { OrgAndProjectGateRedirect } from '@/components/organisms/OrgAndProjectGate';

const AdminLayout = ({ children }: { children: ReactNode }) => {
  const { ensureAuthenticated, isAuthenticated } = useAuth();
  const { data: notificationCounts } = useNotificationCounts();
  const { config, setActiveProject, setActiveOrg } = useConfig();
  const { data: taskCounts } = useTaskCounts(config.activeProjectId || null);
  const { data: allTaskCounts } = useAllTaskCounts();
  const { createOrg } = useOrganizations();
  const { showToast } = useToast();
  const { apiBase, fetchJson } = useApi();
  const { refresh: refreshTree } = useAccessTreeContext();
  const { isSuperadmin } = useSuperadmin();
  const { sourceTypes } = useSourceTypes();

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
        <Spinner size="lg" />
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
          {/* Cross-project items - above project picker, no section title */}
          <Sidebar.Section id="global-items" className="pt-0">
            <Sidebar.MenuItem
              id="global-inbox"
              url="/admin/inbox"
              icon="lucide--inbox"
              iconClassName="!size-5"
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
            <Sidebar.MenuItem
              id="global-all-tasks"
              url="/admin/all-tasks"
              icon="lucide--list-checks"
              iconClassName="!size-5"
              badges={
                (allTaskCounts?.pending || 0) > 0
                  ? [
                      {
                        label:
                          (allTaskCounts?.pending || 0) > 99
                            ? '99+'
                            : (allTaskCounts?.pending || 0).toString(),
                        variant: 'warning',
                      },
                    ]
                  : undefined
              }
            >
              All Tasks
            </Sidebar.MenuItem>
          </Sidebar.Section>
          <Sidebar.Section id="admin-primary" title="Project" className="mt-4">
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
            <Sidebar.MenuItem
              id="admin-recent"
              url="/admin/recent"
              icon="lucide--clock"
            >
              Recent
            </Sidebar.MenuItem>
            <Sidebar.MenuItem
              id="admin-tasks"
              url="/admin/tasks"
              icon="lucide--check-square"
              badges={
                (taskCounts?.pending || 0) > 0
                  ? [
                      {
                        label:
                          (taskCounts?.pending || 0) > 99
                            ? '99+'
                            : (taskCounts?.pending || 0).toString(),
                        variant: 'warning',
                      },
                    ]
                  : undefined
              }
            >
              Tasks
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
              id="admin-chat-sdk"
              url="/admin/chat-sdk"
              icon="lucide--message-square"
            >
              Chat
            </Sidebar.MenuItem>
            <Sidebar.MenuItem
              id="admin-agents"
              url="/admin/agents"
              icon="lucide--bot"
            >
              Agents
            </Sidebar.MenuItem>
          </Sidebar.Section>
          <Sidebar.Section
            id="admin-data-sources"
            title="Data Sources"
            className="mt-4"
          >
            <Sidebar.MenuItem
              id="data-sources-integrations"
              url="/admin/data-sources/integrations"
              icon="lucide--plug-2"
            >
              Integrations
            </Sidebar.MenuItem>
            <Sidebar.MenuItem
              id="data-sources-data"
              url="/admin/apps/documents"
              icon="lucide--database"
            >
              Data
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
            {import.meta.env.DEV && (
              <Sidebar.MenuItem
                id="admin-theme-test"
                url="/admin/theme-test"
                icon="lucide--palette"
              >
                Theme Editor
              </Sidebar.MenuItem>
            )}
          </Sidebar.Section>
          {isSuperadmin && (
            <Sidebar.Section
              id="admin-superadmin"
              title="System Admin"
              className="mt-4"
            >
              <Sidebar.MenuItem
                id="admin-superadmin-panel"
                url="/admin/superadmin/users"
                icon="lucide--shield"
              >
                Superadmin
              </Sidebar.MenuItem>
            </Sidebar.Section>
          )}
        </Sidebar>
        <div className="flex flex-col min-w-0 h-screen overflow-hidden grow">
          <Topbar />
          <div id="layout-content" className="flex-1 min-h-0 overflow-y-auto">
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

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import Editor from '@monaco-editor/react';
import { Icon } from '@/components/atoms/Icon';
import { Spinner } from '@/components/atoms/Spinner';
import { ConfirmActionModal } from '@/components/organisms/ConfirmActionModal/ConfirmActionModal';
import { EmailTemplateRefinementChat } from '@/components/email-templates/EmailTemplateRefinementChat';
import { useToast } from '@/hooks/use-toast';
import {
  useSuperadminTemplateDetail,
  useSuperadminTemplateEditor,
  type EmailTemplateVersion,
} from '@/hooks/use-superadmin-templates';

type LeftPanelTab = 'code' | 'preview';

export default function SuperadminTemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { template, isLoading, error, refetch } =
    useSuperadminTemplateDetail(id);
  const {
    preview,
    isPreviewLoading,
    previewError,
    fetchPreview,
    isSaving,
    saveError,
    saveTemplate,
    versions,
    isLoadingVersions,
    fetchVersions,
    isRollingBack,
    rollbackToVersion,
    isResetting,
    resetToDefault,
  } = useSuperadminTemplateEditor(id);

  const [subjectTemplate, setSubjectTemplate] = useState('');
  const [mjmlContent, setMjmlContent] = useState('');
  const [sampleDataJson, setSampleDataJson] = useState('{}');
  const [changeSummary, setChangeSummary] = useState('');
  const [showSampleData, setShowSampleData] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [activeLeftTab, setActiveLeftTab] = useState<LeftPanelTab>('preview');
  const [showVersionHistoryModal, setShowVersionHistoryModal] = useState(false);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);
  const [selectedVersion, setSelectedVersion] =
    useState<EmailTemplateVersion | null>(null);

  useEffect(() => {
    if (template) {
      setSubjectTemplate(template.subjectTemplate);
      setMjmlContent(template.mjmlContent);
      setSampleDataJson(JSON.stringify(template.sampleData, null, 2));
      setHasUnsavedChanges(false);
      fetchPreview(template.sampleData);
    }
  }, [template, fetchPreview]);

  useEffect(() => {
    if (showVersionHistoryModal) {
      fetchVersions();
    }
  }, [showVersionHistoryModal, fetchVersions]);

  const handleMjmlChange = useCallback((value: string | undefined) => {
    setMjmlContent(value || '');
    setHasUnsavedChanges(true);
  }, []);

  const handleSubjectChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSubjectTemplate(e.target.value);
      setHasUnsavedChanges(true);
    },
    []
  );

  const handleSampleDataChange = useCallback((value: string | undefined) => {
    setSampleDataJson(value || '{}');
  }, []);

  const handlePreview = async () => {
    try {
      const data = JSON.parse(sampleDataJson);
      await fetchPreview(data);
    } catch {
      showToast({
        variant: 'error',
        message: 'Invalid JSON in sample data',
      });
    }
  };

  const handleSave = async () => {
    let parsedSampleData: Record<string, unknown> = {};
    try {
      parsedSampleData = JSON.parse(sampleDataJson);
    } catch {
      showToast({
        variant: 'error',
        message: 'Invalid JSON in sample data. Please fix before saving.',
      });
      return;
    }

    const result = await saveTemplate({
      subjectTemplate,
      mjmlContent,
      sampleData: parsedSampleData,
      changeSummary: changeSummary || undefined,
    });

    if (result) {
      showToast({
        variant: 'success',
        message: `Template saved (version ${result.versionNumber})`,
      });
      setChangeSummary('');
      setHasUnsavedChanges(false);
      refetch();
      if (showVersionHistoryModal) {
        fetchVersions();
      }
    } else if (saveError) {
      showToast({
        variant: 'error',
        message: saveError.message,
      });
    }
  };

  const handleReset = async () => {
    const result = await resetToDefault();
    if (result) {
      showToast({
        variant: 'success',
        message: 'Template reset to default',
      });
      setShowResetConfirm(false);
      setHasUnsavedChanges(false);
      refetch();
      if (showVersionHistoryModal) {
        fetchVersions();
      }
    }
  };

  const handleRollback = async () => {
    if (!selectedVersion) return;

    const result = await rollbackToVersion(selectedVersion.id);
    if (result) {
      showToast({
        variant: 'success',
        message: `Rolled back to version ${selectedVersion.versionNumber}`,
      });
      setShowRollbackConfirm(false);
      setSelectedVersion(null);
      setHasUnsavedChanges(false);
      refetch();
      fetchVersions();
    }
  };

  const openRollbackConfirm = (version: EmailTemplateVersion) => {
    setSelectedVersion(version);
    setShowRollbackConfirm(true);
  };

  const handleTemplateUpdatedFromChat = useCallback(
    (newVersion: number) => {
      showToast({
        variant: 'success',
        message: `Template updated to version ${newVersion}`,
      });
      refetch();
    },
    [showToast, refetch]
  );

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="alert alert-error">
          <Icon icon="lucide--alert-circle" className="size-5" />
          <span>{error.message}</span>
        </div>
        <button
          className="btn btn-ghost mt-4"
          onClick={() => navigate('/admin/superadmin/email-templates')}
        >
          <Icon icon="lucide--arrow-left" className="size-4" />
          Back to Templates
        </button>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="p-6">
        <div className="alert alert-warning">
          <Icon icon="lucide--alert-triangle" className="size-5" />
          <span>Template not found</span>
        </div>
        <button
          className="btn btn-ghost mt-4"
          onClick={() => navigate('/admin/superadmin/email-templates')}
        >
          <Icon icon="lucide--arrow-left" className="size-4" />
          Back to Templates
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-base-200 shrink-0">
        <div className="flex items-center gap-3">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/admin/superadmin/email-templates')}
          >
            <Icon icon="lucide--arrow-left" className="size-4" />
          </button>
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              {template.name}
              <span
                className={`badge badge-sm ${
                  template.isCustomized ? 'badge-primary' : 'badge-ghost'
                }`}
              >
                {template.isCustomized ? 'Customized' : 'Default'}
              </span>
              {hasUnsavedChanges && (
                <span className="badge badge-sm badge-warning">Unsaved</span>
              )}
            </h1>
            {template.description && (
              <p className="text-sm text-base-content/60">
                {template.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowVersionHistoryModal(true)}
          >
            <Icon icon="lucide--history" className="size-4" />
            History
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowResetConfirm(true)}
            disabled={!template.isCustomized || isResetting}
          >
            <Icon icon="lucide--rotate-ccw" className="size-4" />
            Reset
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
          >
            {isSaving ? (
              <Spinner size="sm" />
            ) : (
              <Icon icon="lucide--save" className="size-4" />
            )}
            Save
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        <div className="flex flex-col lg:w-1/2 w-full min-h-[50vh] lg:min-h-0 min-w-0 border-b lg:border-b-0 lg:border-r border-base-200 overflow-hidden">
          <div className="flex items-center gap-1 p-2 border-b border-base-200 bg-base-100 shrink-0">
            <div role="tablist" className="tabs tabs-boxed tabs-sm">
              <button
                role="tab"
                className={`tab gap-1.5 ${
                  activeLeftTab === 'preview' ? 'tab-active' : ''
                }`}
                onClick={() => {
                  setActiveLeftTab('preview');
                  handlePreview();
                }}
              >
                <Icon icon="lucide--eye" className="size-3.5" />
                Preview
              </button>
              <button
                role="tab"
                className={`tab gap-1.5 ${
                  activeLeftTab === 'code' ? 'tab-active' : ''
                }`}
                onClick={() => setActiveLeftTab('code')}
              >
                <Icon icon="lucide--code" className="size-3.5" />
                Code
              </button>
            </div>
            {activeLeftTab === 'preview' && (
              <button
                className="btn btn-primary btn-sm ml-auto"
                onClick={handlePreview}
                disabled={isPreviewLoading}
              >
                {isPreviewLoading ? (
                  <Spinner size="sm" />
                ) : (
                  <Icon icon="lucide--refresh-cw" className="size-4" />
                )}
                Refresh
              </button>
            )}
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            {activeLeftTab === 'preview' ? (
              <div className="flex-1 min-h-0 overflow-hidden bg-base-200/30">
                {isPreviewLoading ? (
                  <div className="flex justify-center items-center h-full">
                    <Spinner size="lg" />
                  </div>
                ) : previewError ? (
                  <div className="p-4">
                    <div className="alert alert-error">
                      <Icon icon="lucide--alert-circle" className="size-5" />
                      <span>{previewError.message}</span>
                    </div>
                  </div>
                ) : preview ? (
                  <div className="h-full flex flex-col">
                    <div className="p-3 bg-base-200 border-b border-base-300 shrink-0">
                      <div className="text-sm">
                        <span className="text-base-content/60">Subject:</span>{' '}
                        <span className="font-medium">{preview.subject}</span>
                      </div>
                    </div>
                    <div className="flex-1 min-h-0">
                      <iframe
                        srcDoc={preview.html}
                        sandbox="allow-same-origin"
                        className="w-full h-full bg-white"
                        title="Email Preview"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center items-center h-full">
                    <Spinner size="lg" />
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-base-200 shrink-0">
                  <label className="label">
                    <span className="label-text font-medium">Subject Line</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered w-full"
                    value={subjectTemplate}
                    onChange={handleSubjectChange}
                    placeholder="Email subject (supports {{variables}})"
                  />
                </div>

                <div className="flex items-center justify-between px-4 py-2 border-b border-base-200 bg-base-200/50 shrink-0">
                  <span className="text-sm font-medium">MJML Template</span>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => setShowSampleData(!showSampleData)}
                  >
                    <Icon
                      icon={
                        showSampleData
                          ? 'lucide--chevron-up'
                          : 'lucide--chevron-down'
                      }
                      className="size-3"
                    />
                    Sample Data
                  </button>
                </div>

                {showSampleData && (
                  <div className="h-48 border-b border-base-200 shrink-0">
                    <Editor
                      height="100%"
                      language="json"
                      theme="vs-dark"
                      value={sampleDataJson}
                      onChange={handleSampleDataChange}
                      options={{
                        minimap: { enabled: false },
                        fontSize: 12,
                        lineNumbers: 'off',
                        folding: false,
                        scrollBeyondLastLine: false,
                      }}
                    />
                  </div>
                )}

                <div className="flex-1 min-h-0">
                  <Editor
                    height="100%"
                    language="html"
                    theme="vs-dark"
                    value={mjmlContent}
                    onChange={handleMjmlChange}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      wordWrap: 'on',
                      scrollBeyondLastLine: false,
                    }}
                  />
                </div>

                <div className="p-3 border-t border-base-200 shrink-0 bg-base-100">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      className="input input-bordered input-sm flex-1"
                      value={changeSummary}
                      onChange={(e) => setChangeSummary(e.target.value)}
                      placeholder="Change summary (optional)"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="lg:w-1/2 w-full flex flex-col bg-base-200/30 min-h-[300px] lg:min-h-0 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 p-2 border-b border-base-200 bg-base-100 shrink-0">
            <Icon icon="lucide--sparkles" className="size-4 text-primary" />
            <span className="font-medium text-sm">AI Chat</span>
          </div>
          <div className="flex-1 min-h-0">
            <EmailTemplateRefinementChat
              templateId={id!}
              templateName={template.name}
              currentMjml={mjmlContent}
              currentSubject={subjectTemplate}
              currentVersionNumber={template.currentVersion?.versionNumber}
              sampleData={template.sampleData}
              onTemplateUpdated={handleTemplateUpdatedFromChat}
            />
          </div>
        </div>
      </div>

      <dialog
        className={`modal ${showVersionHistoryModal ? 'modal-open' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowVersionHistoryModal(false);
        }}
      >
        <div className="modal-box max-w-2xl max-h-[80vh]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Icon icon="lucide--history" className="size-5" />
              Version History
            </h3>
            <button
              className="btn btn-ghost btn-sm btn-circle"
              onClick={() => setShowVersionHistoryModal(false)}
            >
              <Icon icon="lucide--x" className="size-4" />
            </button>
          </div>
          <div className="overflow-y-auto max-h-[60vh]">
            {isLoadingVersions ? (
              <div className="flex justify-center py-8">
                <Spinner size="md" />
              </div>
            ) : versions.length === 0 ? (
              <div className="text-center py-8 text-base-content/60">
                No version history
              </div>
            ) : (
              <div className="space-y-2">
                {versions.map((version) => (
                  <div
                    key={version.id}
                    className={`p-3 rounded-lg border ${
                      version.versionNumber ===
                      template.currentVersion.versionNumber
                        ? 'border-primary bg-primary/5'
                        : 'border-base-200 bg-base-100'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            v{version.versionNumber}
                          </span>
                          {version.versionNumber ===
                            template.currentVersion.versionNumber && (
                            <span className="badge badge-xs badge-primary">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-base-content/60 mt-1">
                          {new Date(version.createdAt).toLocaleString()}
                        </div>
                        {version.createdBy && (
                          <div className="text-xs text-base-content/50">
                            by {version.createdBy.name}
                          </div>
                        )}
                        {version.changeSummary && (
                          <div className="text-sm mt-1 text-base-content/80">
                            {version.changeSummary}
                          </div>
                        )}
                      </div>
                      {version.versionNumber !==
                        template.currentVersion.versionNumber && (
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => openRollbackConfirm(version)}
                          disabled={isRollingBack}
                        >
                          <Icon icon="lucide--undo-2" className="size-3" />
                          Rollback
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </dialog>

      <ConfirmActionModal
        open={showResetConfirm}
        onCancel={() => setShowResetConfirm(false)}
        onConfirm={handleReset}
        title="Reset to Default"
        description="This will reset the template to its original file-based content. All customizations will be preserved in version history."
        confirmVariant="error"
        confirmLabel="Reset Template"
        confirmLoading={isResetting}
      />

      <ConfirmActionModal
        open={showRollbackConfirm}
        onCancel={() => {
          setShowRollbackConfirm(false);
          setSelectedVersion(null);
        }}
        onConfirm={handleRollback}
        title="Rollback to Previous Version"
        description={
          selectedVersion
            ? `This will restore the template to version ${selectedVersion.versionNumber}. A new version will be created from the rolled-back content.`
            : ''
        }
        confirmVariant="warning"
        confirmLabel="Rollback"
        confirmLoading={isRollingBack}
      />
    </div>
  );
}

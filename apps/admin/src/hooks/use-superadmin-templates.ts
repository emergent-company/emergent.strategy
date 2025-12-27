import { useState, useEffect, useCallback } from 'react';
import { useApi } from './use-api';

export interface TemplateVariable {
  name: string;
  type: 'string' | 'url' | 'date' | 'object';
  description: string;
  required: boolean;
  defaultValue?: unknown;
}

export interface EmailTemplateListItem {
  id: string;
  name: string;
  description: string | null;
  isCustomized: boolean;
  currentVersionNumber: number;
  updatedAt: string;
  updatedBy: { id: string; name: string } | null;
}

export interface EmailTemplateDetail {
  id: string;
  name: string;
  description: string | null;
  subjectTemplate: string;
  mjmlContent: string;
  variables: TemplateVariable[];
  sampleData: Record<string, unknown>;
  isCustomized: boolean;
  currentVersion: {
    id: string;
    versionNumber: number;
    createdAt: string;
    createdBy: { id: string; name: string } | null;
  };
}

export interface EmailTemplateVersion {
  id: string;
  versionNumber: number;
  changeSummary: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
}

export interface TemplatePreviewResponse {
  html: string;
  text: string | null;
  subject: string;
}

export interface MjmlPreviewResponse {
  html: string;
  text: string | null;
  subject: string | null;
}

export interface ListTemplatesResponse {
  templates: EmailTemplateListItem[];
}

export interface ListVersionsResponse {
  versions: EmailTemplateVersion[];
  total: number;
}

export interface UpdateTemplateResponse {
  id: string;
  versionNumber: number;
  createdAt: string;
}

export interface UseSuperadminTemplatesResult {
  templates: EmailTemplateListItem[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useSuperadminTemplates(): UseSuperadminTemplatesResult {
  const { apiBase, fetchJson } = useApi();
  const [templates, setTemplates] = useState<EmailTemplateListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTemplates = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetchJson<ListTemplatesResponse>(
        `${apiBase}/api/superadmin/email-templates`
      );

      setTemplates(response.templates);
    } catch (e) {
      setError(
        e instanceof Error ? e : new Error('Failed to fetch email templates')
      );
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, fetchJson]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return {
    templates,
    isLoading,
    error,
    refetch: fetchTemplates,
  };
}

export interface UseSuperadminTemplateDetailResult {
  template: EmailTemplateDetail | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useSuperadminTemplateDetail(
  templateId: string | undefined
): UseSuperadminTemplateDetailResult {
  const { apiBase, fetchJson } = useApi();
  const [template, setTemplate] = useState<EmailTemplateDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTemplate = useCallback(async () => {
    if (!templateId) {
      setTemplate(null);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const response = await fetchJson<EmailTemplateDetail>(
        `${apiBase}/api/superadmin/email-templates/${templateId}`
      );

      setTemplate(response);
    } catch (e) {
      setError(
        e instanceof Error ? e : new Error('Failed to fetch template details')
      );
      setTemplate(null);
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, fetchJson, templateId]);

  useEffect(() => {
    fetchTemplate();
  }, [fetchTemplate]);

  return {
    template,
    isLoading,
    error,
    refetch: fetchTemplate,
  };
}

export interface UseSuperadminTemplateEditorResult {
  preview: TemplatePreviewResponse | null;
  isPreviewLoading: boolean;
  previewError: Error | null;
  fetchPreview: (data?: Record<string, unknown>) => Promise<void>;
  clearPreview: () => void;

  isSaving: boolean;
  saveError: Error | null;
  saveTemplate: (params: {
    subjectTemplate: string;
    mjmlContent: string;
    sampleData?: Record<string, unknown>;
    changeSummary?: string;
  }) => Promise<UpdateTemplateResponse | null>;

  versions: EmailTemplateVersion[];
  isLoadingVersions: boolean;
  versionsError: Error | null;
  fetchVersions: () => Promise<void>;

  isRollingBack: boolean;
  rollbackError: Error | null;
  rollbackToVersion: (
    versionId: string
  ) => Promise<UpdateTemplateResponse | null>;

  isResetting: boolean;
  resetError: Error | null;
  resetToDefault: () => Promise<UpdateTemplateResponse | null>;
}

export function useSuperadminTemplateEditor(
  templateId: string | undefined
): UseSuperadminTemplateEditorResult {
  const { apiBase, fetchJson } = useApi();

  const [preview, setPreview] = useState<TemplatePreviewResponse | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<Error | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<Error | null>(null);

  const [versions, setVersions] = useState<EmailTemplateVersion[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [versionsError, setVersionsError] = useState<Error | null>(null);

  const [isRollingBack, setIsRollingBack] = useState(false);
  const [rollbackError, setRollbackError] = useState<Error | null>(null);

  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<Error | null>(null);

  const fetchPreview = useCallback(
    async (data?: Record<string, unknown>) => {
      if (!templateId) return;

      try {
        setIsPreviewLoading(true);
        setPreviewError(null);

        const response = await fetchJson<TemplatePreviewResponse>(
          `${apiBase}/api/superadmin/email-templates/${templateId}/preview`,
          {
            method: 'POST',
            body: { data },
          }
        );

        setPreview(response);
      } catch (e) {
        setPreviewError(
          e instanceof Error ? e : new Error('Failed to generate preview')
        );
        setPreview(null);
      } finally {
        setIsPreviewLoading(false);
      }
    },
    [apiBase, fetchJson, templateId]
  );

  const clearPreview = useCallback(() => {
    setPreview(null);
    setPreviewError(null);
  }, []);

  const saveTemplate = useCallback(
    async (params: {
      subjectTemplate: string;
      mjmlContent: string;
      sampleData?: Record<string, unknown>;
      changeSummary?: string;
    }): Promise<UpdateTemplateResponse | null> => {
      if (!templateId) return null;

      try {
        setIsSaving(true);
        setSaveError(null);

        const response = await fetchJson<UpdateTemplateResponse>(
          `${apiBase}/api/superadmin/email-templates/${templateId}`,
          {
            method: 'PUT',
            body: params,
          }
        );

        return response;
      } catch (e) {
        setSaveError(
          e instanceof Error ? e : new Error('Failed to save template')
        );
        return null;
      } finally {
        setIsSaving(false);
      }
    },
    [apiBase, fetchJson, templateId]
  );

  const fetchVersions = useCallback(async () => {
    if (!templateId) return;

    try {
      setIsLoadingVersions(true);
      setVersionsError(null);

      const response = await fetchJson<ListVersionsResponse>(
        `${apiBase}/api/superadmin/email-templates/${templateId}/versions`
      );

      setVersions(response.versions);
    } catch (e) {
      setVersionsError(
        e instanceof Error ? e : new Error('Failed to fetch versions')
      );
      setVersions([]);
    } finally {
      setIsLoadingVersions(false);
    }
  }, [apiBase, fetchJson, templateId]);

  const rollbackToVersion = useCallback(
    async (versionId: string): Promise<UpdateTemplateResponse | null> => {
      if (!templateId) return null;

      try {
        setIsRollingBack(true);
        setRollbackError(null);

        const response = await fetchJson<UpdateTemplateResponse>(
          `${apiBase}/api/superadmin/email-templates/${templateId}/rollback`,
          {
            method: 'POST',
            body: { versionId },
          }
        );

        return response;
      } catch (e) {
        setRollbackError(
          e instanceof Error ? e : new Error('Failed to rollback template')
        );
        return null;
      } finally {
        setIsRollingBack(false);
      }
    },
    [apiBase, fetchJson, templateId]
  );

  const resetToDefault =
    useCallback(async (): Promise<UpdateTemplateResponse | null> => {
      if (!templateId) return null;

      try {
        setIsResetting(true);
        setResetError(null);

        const response = await fetchJson<UpdateTemplateResponse>(
          `${apiBase}/api/superadmin/email-templates/${templateId}/reset`,
          {
            method: 'POST',
          }
        );

        return response;
      } catch (e) {
        setResetError(
          e instanceof Error ? e : new Error('Failed to reset template')
        );
        return null;
      } finally {
        setIsResetting(false);
      }
    }, [apiBase, fetchJson, templateId]);

  return {
    preview,
    isPreviewLoading,
    previewError,
    fetchPreview,
    clearPreview,

    isSaving,
    saveError,
    saveTemplate,

    versions,
    isLoadingVersions,
    versionsError,
    fetchVersions,

    isRollingBack,
    rollbackError,
    rollbackToVersion,

    isResetting,
    resetError,
    resetToDefault,
  };
}

export async function previewCustomMjml(
  apiBase: string,
  fetchJson: <T>(
    url: string,
    options?: {
      method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
      body?: unknown;
    }
  ) => Promise<T>,
  mjmlContent: string,
  subjectTemplate?: string,
  data?: Record<string, unknown>
): Promise<MjmlPreviewResponse> {
  return fetchJson<MjmlPreviewResponse>(
    `${apiBase}/api/superadmin/email-templates/preview-mjml`,
    {
      method: 'POST',
      body: {
        mjmlContent,
        subjectTemplate,
        data,
      },
    }
  );
}

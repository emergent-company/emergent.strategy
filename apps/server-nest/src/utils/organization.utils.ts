export const getOrganizationId = (row: { organization_id?: string; tenant_id?: string; org_id?: string }): string | null => {
  return row.organization_id ?? row.tenant_id ?? row.org_id ?? null;
};

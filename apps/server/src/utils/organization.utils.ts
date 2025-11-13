export const getOrganizationId = (row: { organization_id?: string }): string | null => {
  return row.organization_id ?? null;
};

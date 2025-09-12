// Utility helpers to normalize and compare organization IDs that may arrive in
// different formats (case differences, stray separators, etc.)

export function normalizeOrgId(id: string | undefined | null): string | undefined {
    if (!id) return undefined;
    // Lowercase and strip non-alphanumeric characters except hyphen to smooth out
    // backend inconsistencies (e.g., upper-case UUID vs lower-case, or accidental spaces).
    const trimmed = id.trim();
    // Keep hyphens because backend UUID queries typically accept either case form.
    return trimmed.toLowerCase();
}

export function orgIdsMatch(a: string | undefined | null, b: string | undefined | null): boolean {
    const na = normalizeOrgId(a);
    const nb = normalizeOrgId(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    // Fallback: compare stripped of hyphens (UUID canonicalization) to tolerate dashless vs dashed forms.
    return na.replace(/-/g, "") === nb.replace(/-/g, "");
}

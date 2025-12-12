/**
 * Footer Organism
 * Migrated from legacy path: src/components/layout/Footer.tsx
 * Responsibility: Presentational application footer shell.
 * No data fetching or side-effects; year computed at render time only.
 */
import { SystemStatusDropdown } from '@/components/molecules/SystemStatusDropdown';

export interface FooterProps {
  className?: string;
  /** Override year for testing or historical rendering */
  yearOverride?: number;
}

export const Footer: React.FC<FooterProps> = ({ className, yearOverride }) => {
  const year = yearOverride ?? new Date().getFullYear();
  return (
    <div
      role="contentinfo"
      className={`flex flex-wrap justify-between items-center gap-3 px-6 py-3 w-full ${
        className ?? ''
      }`}
      data-testid="app-footer"
    >
      <SystemStatusDropdown />
      <span className="text-sm text-base-content/80">
        © {year} Emergent. All rights reserved
      </span>
    </div>
  );
};

export default Footer;

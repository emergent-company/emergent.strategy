/**
 * Footer Organism
 * Migrated from legacy path: src/components/layout/Footer.tsx
 * Responsibility: Presentational application footer shell.
 * No data fetching or side-effects; year computed at render time only.
 */
import React from 'react';

export interface FooterProps {
  className?: string;
  /** Override year for testing or historical rendering */
  yearOverride?: number;
  statusMessage?: string;
}

export const Footer: React.FC<FooterProps> = ({
  className,
  yearOverride,
  statusMessage,
}) => {
  const year = yearOverride ?? new Date().getFullYear();
  return (
    <div
      role="contentinfo"
      className={`flex flex-wrap justify-between items-center gap-3 px-6 py-3 w-full ${
        className ?? ''
      }`}
      data-testid="app-footer"
    >
      <div className="flex items-center gap-2.5 bg-base-100 hover:bg-base-200 shadow-xs px-2.5 py-1 border border-base-300 rounded-full transition-colors cursor-pointer">
        <span
          className="status status-success"
          aria-label="System Status: OK"
        />
        <p className="text-sm text-base-content/80">
          {statusMessage || 'System running smoothly'}
        </p>
      </div>
      <span className="text-sm text-base-content/80">
        © {year} Emergent. All rights reserved
      </span>
    </div>
  );
};

export default Footer;

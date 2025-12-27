/**
 * Topbar Organism
 *
 * Migrated from legacy path: src/components/layout/Topbar.tsx
 * Responsibilities: structural horizontal navigation container; composes smaller molecules.
 * No direct data fetching; relies on child components for interactive behavior.
 * Shim remains at legacy path until 2025-11.
 */
import React from 'react';
import { ThemeToggle } from '@/components/molecules/ThemeToggle';
import { TopbarNotificationButton } from '@/components/organisms/Topbar/partials/TopbarNotificationButton';
import { TopbarProfileMenu } from '@/components/organisms/Topbar/partials/TopbarProfileMenu';
import { TopbarSearchButton } from '@/components/organisms/Topbar/partials/TopbarSearchButton';
import { TopbarLeftmenuToggle } from '@/components/organisms/Topbar/partials/TopbarLeftmenuToggle';
import { TopbarRightbarButton } from '@/components/organisms/Topbar/partials/TopbarRightbarButton';
import { TopbarSuperadminButton } from '@/components/organisms/Topbar/partials/TopbarSuperadminButton';

export interface TopbarProps {
  className?: string;
}

export const Topbar: React.FC<TopbarProps> = ({ className }) => {
  return (
    <div
      role="navigation"
      aria-label="Navbar"
      id="layout-topbar"
      className={`flex justify-between items-center px-3 sm:px-6 ${
        className ?? ''
      }`}
    >
      <div className="inline-flex items-center gap-3">
        <TopbarLeftmenuToggle />
        <TopbarLeftmenuToggle hoverMode />
        <TopbarSearchButton />
      </div>
      <div className="inline-flex items-center gap-0.5">
        <TopbarSuperadminButton />
        <ThemeToggle className="btn btn-sm btn-circle btn-ghost" />
        <TopbarRightbarButton />
        <TopbarNotificationButton />
        <TopbarProfileMenu />
      </div>
    </div>
  );
};

export default Topbar;

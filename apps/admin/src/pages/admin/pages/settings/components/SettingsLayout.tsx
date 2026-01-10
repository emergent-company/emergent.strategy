/**
 * SettingsLayout - Layout wrapper for settings pages with sidebar navigation
 *
 * Provides a two-panel layout with:
 * - Left: Fixed settings navigation sidebar (does not scroll with content)
 * - Right: Scrollable main content area (children)
 *
 * @example
 * ```tsx
 * <SettingsLayout>
 *   <YourSettingsPage />
 * </SettingsLayout>
 * ```
 */
import { ReactNode } from 'react';
import { SettingsSidebar } from './SettingsSidebar';

export interface SettingsLayoutProps {
  children: ReactNode;
}

export function SettingsLayout({ children }: SettingsLayoutProps) {
  return (
    <div className="flex h-full overflow-hidden" data-testid="settings-layout">
      {/* Sidebar - Fixed width, does not scroll, always visible on desktop */}
      <aside className="hidden lg:flex lg:flex-col w-56 shrink-0 border-r border-base-200 overflow-y-auto">
        <SettingsSidebar />
      </aside>

      {/* Main content area - scrolls independently */}
      <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
    </div>
  );
}

export default SettingsLayout;

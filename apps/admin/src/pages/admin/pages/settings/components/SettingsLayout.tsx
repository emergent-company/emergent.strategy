/**
 * SettingsLayout - Layout wrapper for settings pages with sidebar navigation
 *
 * Provides a two-panel layout with:
 * - Left: Always-visible settings navigation sidebar
 * - Right: Main content area (children)
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
    <div className="flex min-h-full" data-testid="settings-layout">
      {/* Sidebar - Fixed width, always visible on desktop, hidden on mobile */}
      <aside className="hidden lg:block w-56 shrink-0 border-r border-base-200">
        <div className="sticky top-0 h-[calc(100vh-theme(spacing.16))] overflow-y-auto">
          <SettingsSidebar />
        </div>
      </aside>

      {/* Main content area */}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

export default SettingsLayout;

/**
 * SettingsPageWrapper - Wraps settings page content with SettingsLayout
 *
 * This component lazy-loads a settings page component and wraps it
 * with the SettingsLayout (sidebar + main content area).
 */
import { Suspense, LazyExoticComponent, JSX } from 'react';
import { SettingsLayout } from './components';

interface SettingsPageWrapperProps {
  component: LazyExoticComponent<() => JSX.Element>;
}

export function SettingsPageWrapper({
  component: Component,
}: SettingsPageWrapperProps) {
  return (
    <SettingsLayout>
      <Suspense
        fallback={
          <div className="flex justify-center items-center py-12">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        }
      >
        <Component />
      </Suspense>
    </SettingsLayout>
  );
}

export default SettingsPageWrapper;

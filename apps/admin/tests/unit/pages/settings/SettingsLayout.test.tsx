/**
 * Tests SettingsLayout component.
 *
 * Mocked: None
 * Real: Component rendering
 * Auth: Not applicable (unit test)
 */
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SettingsLayout } from '@/pages/admin/pages/settings/components/SettingsLayout';

// Wrapper to provide router context
const renderWithRouter = (
  ui: React.ReactElement,
  route = '/admin/settings'
) => {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
};

describe('SettingsLayout', () => {
  describe('Rendering', () => {
    it('renders children content', () => {
      renderWithRouter(
        <SettingsLayout>
          <div data-testid="child-content">Test Content</div>
        </SettingsLayout>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });

    it('renders settings layout container with correct testid', () => {
      renderWithRouter(
        <SettingsLayout>
          <div>Content</div>
        </SettingsLayout>
      );

      expect(screen.getByTestId('settings-layout')).toBeInTheDocument();
    });

    it('renders sidebar navigation', () => {
      renderWithRouter(
        <SettingsLayout>
          <div>Content</div>
        </SettingsLayout>
      );

      // SettingsSidebar should be rendered with navigation
      expect(
        screen.getByRole('navigation', { name: 'Settings navigation' })
      ).toBeInTheDocument();
    });

    it('renders main content area', () => {
      renderWithRouter(
        <SettingsLayout>
          <main data-testid="page-content">Page Content</main>
        </SettingsLayout>
      );

      expect(screen.getByTestId('page-content')).toBeInTheDocument();
    });
  });

  describe('Layout Structure', () => {
    it('has flex container with min-height', () => {
      renderWithRouter(
        <SettingsLayout>
          <div>Content</div>
        </SettingsLayout>
      );

      const container = screen.getByTestId('settings-layout');
      expect(container).toHaveClass('flex');
      expect(container).toHaveClass('min-h-full');
    });

    it('sidebar is hidden on mobile (lg:block)', () => {
      renderWithRouter(
        <SettingsLayout>
          <div>Content</div>
        </SettingsLayout>
      );

      // The aside element should have hidden lg:block classes
      const aside = screen
        .getByRole('navigation', {
          name: 'Settings navigation',
        })
        .closest('aside');
      expect(aside).toHaveClass('hidden');
      expect(aside).toHaveClass('lg:block');
    });

    it('sidebar has fixed width', () => {
      renderWithRouter(
        <SettingsLayout>
          <div>Content</div>
        </SettingsLayout>
      );

      const aside = screen
        .getByRole('navigation', {
          name: 'Settings navigation',
        })
        .closest('aside');
      expect(aside).toHaveClass('w-56');
    });
  });

  describe('Content Rendering', () => {
    it('renders complex children correctly', () => {
      renderWithRouter(
        <SettingsLayout>
          <div>
            <h1>Settings Page Title</h1>
            <p>Description text</p>
            <button>Action Button</button>
          </div>
        </SettingsLayout>
      );

      expect(screen.getByText('Settings Page Title')).toBeInTheDocument();
      expect(screen.getByText('Description text')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Action Button' })
      ).toBeInTheDocument();
    });

    it('renders multiple children elements', () => {
      renderWithRouter(
        <SettingsLayout>
          <div data-testid="first">First</div>
          <div data-testid="second">Second</div>
        </SettingsLayout>
      );

      expect(screen.getByTestId('first')).toBeInTheDocument();
      expect(screen.getByTestId('second')).toBeInTheDocument();
    });
  });
});

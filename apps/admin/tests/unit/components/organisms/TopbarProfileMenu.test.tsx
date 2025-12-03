import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { TopbarProfileMenu } from '@/components/organisms/Topbar/partials/TopbarProfileMenu';

// Mock useAuth
vi.mock('@/contexts/useAuth', () => ({
  useAuth: () => ({
    logout: vi.fn(),
  }),
}));

const renderWithRouter = (component: React.ReactNode) => {
  return render(<MemoryRouter>{component}</MemoryRouter>);
};

describe('TopbarProfileMenu', () => {
  describe('8.7: Simplified menu - no organization switcher', () => {
    it('should not contain organization switcher section', () => {
      renderWithRouter(<TopbarProfileMenu />);

      // Verify no organization-related items exist
      expect(screen.queryByText(/organization/i)).not.toBeInTheDocument();
      expect(
        screen.queryByText(/switch organization/i)
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/add organization/i)).not.toBeInTheDocument();

      // Verify no org-related test IDs
      expect(screen.queryByTestId('org-switcher')).not.toBeInTheDocument();
      expect(screen.queryByTestId('organization-list')).not.toBeInTheDocument();
    });

    it('should contain profile menu items', () => {
      renderWithRouter(<TopbarProfileMenu />);

      // These items should exist in the simplified menu
      expect(screen.getByText('My Profile')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('Help')).toBeInTheDocument();
      expect(screen.getByText('Logout')).toBeInTheDocument();
    });

    it('should have avatar trigger', () => {
      renderWithRouter(<TopbarProfileMenu />);

      expect(screen.getByTestId('avatar-trigger')).toBeInTheDocument();
      expect(screen.getByTestId('avatar-image')).toBeInTheDocument();
    });

    it('should link to correct routes', () => {
      renderWithRouter(<TopbarProfileMenu />);

      const profileLink = screen.getByRole('link', { name: /my profile/i });
      expect(profileLink).toHaveAttribute('href', '/admin/settings/profile');

      const settingsLink = screen.getByRole('link', { name: /settings/i });
      expect(settingsLink).toHaveAttribute('href', '/admin/settings');
    });
  });
});

/**
 * Tests SettingsSidebar component.
 *
 * Mocked: None
 * Real: Component rendering, routing
 * Auth: Not applicable (unit test)
 */
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SettingsSidebar } from '@/pages/admin/pages/settings/components/SettingsSidebar';

// Wrapper to provide router context
const renderWithRouter = (
  ui: React.ReactElement,
  route = '/admin/settings/project/templates'
) => {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
};

describe('SettingsSidebar', () => {
  describe('Rendering', () => {
    it('renders navigation element with correct aria-label', () => {
      renderWithRouter(<SettingsSidebar />);

      expect(
        screen.getByRole('navigation', { name: 'Settings navigation' })
      ).toBeInTheDocument();
    });

    it('renders all navigation groups', () => {
      renderWithRouter(<SettingsSidebar />);

      // Should have group headings
      expect(screen.getByText('General')).toBeInTheDocument();
      expect(screen.getByText('AI & Extraction')).toBeInTheDocument();
      expect(screen.getByText('Team')).toBeInTheDocument();
    });

    it('renders General group items', () => {
      renderWithRouter(<SettingsSidebar />);

      expect(screen.getByText('Template Packs')).toBeInTheDocument();
      expect(screen.getByText('Template Studio')).toBeInTheDocument();
    });

    it('renders AI & Extraction group items', () => {
      renderWithRouter(<SettingsSidebar />);

      expect(screen.getByText('Auto-Extraction')).toBeInTheDocument();
      expect(screen.getByText('LLM Settings')).toBeInTheDocument();
      expect(screen.getByText('Document Processing')).toBeInTheDocument();
      expect(screen.getByText('Prompts')).toBeInTheDocument();
    });

    it('renders Team group items', () => {
      renderWithRouter(<SettingsSidebar />);

      expect(screen.getByText('Members')).toBeInTheDocument();
    });
  });

  describe('Navigation Links', () => {
    it('renders links with correct hrefs', () => {
      renderWithRouter(<SettingsSidebar />);

      const templatePacksLink = screen.getByRole('link', {
        name: /Template Packs/i,
      });
      expect(templatePacksLink).toHaveAttribute(
        'href',
        '/admin/settings/project/templates'
      );

      const membersLink = screen.getByRole('link', { name: /Members/i });
      expect(membersLink).toHaveAttribute(
        'href',
        '/admin/settings/project/members'
      );
    });

    it('has correct href for Template Studio', () => {
      renderWithRouter(<SettingsSidebar />);

      const link = screen.getByRole('link', { name: /Template Studio/i });
      expect(link).toHaveAttribute(
        'href',
        '/admin/settings/project/template-studio'
      );
    });

    it('has correct href for Auto-Extraction', () => {
      renderWithRouter(<SettingsSidebar />);

      const link = screen.getByRole('link', { name: /Auto-Extraction/i });
      expect(link).toHaveAttribute(
        'href',
        '/admin/settings/project/auto-extraction'
      );
    });

    it('has correct href for LLM Settings', () => {
      renderWithRouter(<SettingsSidebar />);

      const link = screen.getByRole('link', { name: /LLM Settings/i });
      expect(link).toHaveAttribute(
        'href',
        '/admin/settings/project/llm-settings'
      );
    });

    it('has correct href for Document Processing', () => {
      renderWithRouter(<SettingsSidebar />);

      const link = screen.getByRole('link', { name: /Document Processing/i });
      expect(link).toHaveAttribute('href', '/admin/settings/project/chunking');
    });

    it('has correct href for Prompts', () => {
      renderWithRouter(<SettingsSidebar />);

      const link = screen.getByRole('link', { name: /Prompts/i });
      expect(link).toHaveAttribute('href', '/admin/settings/ai/prompts');
    });
  });

  describe('Active State', () => {
    it('marks Templates link as active when on templates page', () => {
      renderWithRouter(
        <SettingsSidebar />,
        '/admin/settings/project/templates'
      );

      const link = screen.getByRole('link', { name: /Template Packs/i });
      expect(link).toHaveAttribute('aria-current', 'page');
      expect(link).toHaveClass('bg-primary/10');
    });

    it('marks Members link as active when on members page', () => {
      renderWithRouter(<SettingsSidebar />, '/admin/settings/project/members');

      const link = screen.getByRole('link', { name: /Members/i });
      expect(link).toHaveAttribute('aria-current', 'page');
      expect(link).toHaveClass('bg-primary/10');
    });

    it('does not mark inactive links with aria-current', () => {
      renderWithRouter(
        <SettingsSidebar />,
        '/admin/settings/project/templates'
      );

      const membersLink = screen.getByRole('link', { name: /Members/i });
      expect(membersLink).not.toHaveAttribute('aria-current');
    });

    it('applies hover styling to inactive links', () => {
      renderWithRouter(
        <SettingsSidebar />,
        '/admin/settings/project/templates'
      );

      const membersLink = screen.getByRole('link', { name: /Members/i });
      expect(membersLink).toHaveClass('hover:bg-base-200');
    });
  });

  describe('Group Structure', () => {
    it('renders group titles as h3 headings', () => {
      renderWithRouter(<SettingsSidebar />);

      const headings = screen.getAllByRole('heading', { level: 3 });
      expect(headings).toHaveLength(3);
      expect(headings[0]).toHaveTextContent('General');
      expect(headings[1]).toHaveTextContent('AI & Extraction');
      expect(headings[2]).toHaveTextContent('Team');
    });

    it('renders items as list items', () => {
      renderWithRouter(<SettingsSidebar />);

      // Each group has a ul with menu class
      const lists = document.querySelectorAll('.menu');
      expect(lists).toHaveLength(3);

      // Total list items should be 7 (2 + 4 + 1)
      const listItems = document.querySelectorAll('.menu li');
      expect(listItems).toHaveLength(7);
    });
  });

  describe('Icons', () => {
    it('renders icons for navigation items', () => {
      renderWithRouter(<SettingsSidebar />);

      // Check that icons are present (they have the iconify class structure)
      const nav = screen.getByRole('navigation', {
        name: 'Settings navigation',
      });
      const icons = nav.querySelectorAll('[class*="lucide--"]');
      expect(icons.length).toBeGreaterThanOrEqual(7); // At least one per nav item
    });
  });

  describe('Accessibility', () => {
    it('has accessible navigation landmark', () => {
      renderWithRouter(<SettingsSidebar />);

      const nav = screen.getByRole('navigation', {
        name: 'Settings navigation',
      });
      expect(nav).toBeInTheDocument();
    });

    it('all links are keyboard accessible', () => {
      renderWithRouter(<SettingsSidebar />);

      const links = screen.getAllByRole('link');
      links.forEach((link) => {
        // Links should be focusable (not have negative tabindex)
        expect(link).not.toHaveAttribute('tabindex', '-1');
      });
    });

    it('group headings provide context', () => {
      renderWithRouter(<SettingsSidebar />);

      // Verify headings exist and have proper structure
      const generalHeading = screen.getByRole('heading', { name: 'General' });
      const aiHeading = screen.getByRole('heading', {
        name: 'AI & Extraction',
      });
      const teamHeading = screen.getByRole('heading', { name: 'Team' });

      expect(generalHeading).toBeInTheDocument();
      expect(aiHeading).toBeInTheDocument();
      expect(teamHeading).toBeInTheDocument();
    });
  });
});

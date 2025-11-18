import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PageTitle, type IBreadcrumbItem } from '@/components/molecules/PageTitle';

describe('PageTitle', () => {
    const items: IBreadcrumbItem[] = [
        { label: 'Settings', path: '/admin/settings' },
        { label: 'Profile', active: true },
    ];

    it('renders title, breadcrumbs and centerItem', () => {
        render(
            <MemoryRouter>
                <PageTitle title="User" items={items} centerItem={<span data-testid="center">X</span>} />
            </MemoryRouter>
        );

        expect(screen.getByText('User')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /nexus/i })).toHaveAttribute('href', '/admin');
        expect(screen.getByRole('link', { name: /settings/i })).toHaveAttribute('href', '/admin/settings');
        const profile = screen.getByText('Profile');
        expect(profile.closest('li')).toHaveClass('opacity-80');
        expect(screen.getByTestId('center')).toBeInTheDocument();
    });
});

import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Icon } from '@/components/atoms/Icon';

describe('Icon', () => {
    // Basic Rendering
    describe('Rendering', () => {
        it('renders without crashing', () => {
            const { container } = render(<Icon icon="lucide--home" />);
            const icon = container.querySelector('span');
            expect(icon).toBeInTheDocument();
        });

        it('applies iconify class', () => {
            const { container } = render(<Icon icon="lucide--home" />);
            const icon = container.querySelector('span');
            expect(icon?.className).toMatch(/\biconify\b/);
        });

        it('applies icon class from props', () => {
            const { container } = render(<Icon icon="lucide--home" />);
            const icon = container.querySelector('span');
            expect(icon?.className).toMatch(/lucide--home/);
        });

        it('renders different icon names correctly', () => {
            const { container: container1 } = render(<Icon icon="lucide--search" />);
            expect(container1.querySelector('span')?.className).toMatch(/lucide--search/);

            const { container: container2 } = render(<Icon icon="lucide--settings" />);
            expect(container2.querySelector('span')?.className).toMatch(/lucide--settings/);

            const { container: container3 } = render(<Icon icon="lucide--user" />);
            expect(container3.querySelector('span')?.className).toMatch(/lucide--user/);
        });
    });

    // Accessibility
    describe('Accessibility', () => {
        it('is aria-hidden by default when no ariaLabel provided', () => {
            const { container } = render(<Icon icon="lucide--home" />);
            const icon = container.querySelector('span');
            expect(icon).toHaveAttribute('aria-hidden', 'true');
            expect(icon).not.toHaveAttribute('role');
        });

        it('sets role="img" when ariaLabel is provided', () => {
            render(<Icon icon="lucide--home" ariaLabel="Home icon" />);
            const icon = screen.getByRole('img', { name: 'Home icon' });
            expect(icon).toBeInTheDocument();
            expect(icon).not.toHaveAttribute('aria-hidden');
        });

        it('applies correct aria-label', () => {
            render(<Icon icon="lucide--search" ariaLabel="Search" />);
            const icon = screen.getByRole('img', { name: 'Search' });
            expect(icon).toHaveAttribute('aria-label', 'Search');
        });

        it('supports complex aria labels', () => {
            render(<Icon icon="lucide--alert" ariaLabel="Warning: Action required" />);
            const icon = screen.getByRole('img', { name: 'Warning: Action required' });
            expect(icon).toBeInTheDocument();
        });
    });

    // Custom className
    describe('Custom styling', () => {
        it('merges custom className with icon classes', () => {
            const { container } = render(
                <Icon icon="lucide--home" className="text-primary text-xl" />
            );
            const icon = container.querySelector('span');
            expect(icon?.className).toMatch(/\biconify\b/);
            expect(icon?.className).toMatch(/lucide--home/);
            expect(icon?.className).toMatch(/text-primary/);
            expect(icon?.className).toMatch(/text-xl/);
        });

        it('works without custom className', () => {
            const { container } = render(<Icon icon="lucide--home" />);
            const icon = container.querySelector('span');
            const classes = icon?.className.split(' ') || [];
            expect(classes).toEqual(['iconify', 'lucide--home']);
        });

        it('handles undefined className gracefully', () => {
            const { container } = render(<Icon icon="lucide--home" className={undefined} />);
            const icon = container.querySelector('span');
            expect(icon?.className).not.toMatch(/undefined/);
        });
    });

    // HTML Attributes Pass-through
    describe('HTML attributes', () => {
        it('passes through data attributes', () => {
            const { container } = render(
                <Icon icon="lucide--home" data-testid="custom-icon" data-value="test" />
            );
            const icon = container.querySelector('span');
            expect(icon).toHaveAttribute('data-testid', 'custom-icon');
            expect(icon).toHaveAttribute('data-value', 'test');
        });

        it('passes through id attribute', () => {
            const { container } = render(<Icon icon="lucide--home" id="home-icon" />);
            const icon = container.querySelector('span');
            expect(icon).toHaveAttribute('id', 'home-icon');
        });

        it('passes through style attribute', () => {
            const { container } = render(
                <Icon icon="lucide--home" style={{ fontSize: '24px', color: 'red' }} />
            );
            const icon = container.querySelector('span');
            expect(icon).toHaveStyle({ fontSize: '24px' });
            expect(icon).toHaveStyle({ color: 'rgb(255, 0, 0)' });
        });

        it('passes through title attribute', () => {
            const { container } = render(
                <Icon icon="lucide--home" title="Home tooltip" />
            );
            const icon = container.querySelector('span');
            expect(icon).toHaveAttribute('title', 'Home tooltip');
        });
    });

    // Edge Cases
    describe('Edge cases', () => {
        it('handles empty string className', () => {
            const { container } = render(<Icon icon="lucide--home" className="" />);
            const icon = container.querySelector('span');
            expect(icon?.className).toBe('iconify lucide--home');
        });

        it('handles icon with special characters', () => {
            const { container } = render(<Icon icon="lucide--chevron-right" />);
            const icon = container.querySelector('span');
            expect(icon?.className).toMatch(/lucide--chevron-right/);
        });

        it('renders multiple icons independently', () => {
            const { container } = render(
                <>
                    <Icon icon="lucide--home" ariaLabel="Home" />
                    <Icon icon="lucide--search" ariaLabel="Search" />
                    <Icon icon="lucide--user" ariaLabel="User" />
                </>
            );
            expect(screen.getByRole('img', { name: 'Home' })).toBeInTheDocument();
            expect(screen.getByRole('img', { name: 'Search' })).toBeInTheDocument();
            expect(screen.getByRole('img', { name: 'User' })).toBeInTheDocument();
        });
    });
});

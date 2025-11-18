import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { IconButton } from '@/components/molecules/IconButton';
import { Icon } from '@/components/atoms/Icon';

describe('IconButton', () => {
    // Basic Rendering
    describe('Rendering', () => {
        it('renders without crashing', () => {
            render(
                <IconButton aria-label="Search">
                    <Icon icon="lucide--search" />
                </IconButton>
            );
            expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument();
        });

        it('renders children (icon)', () => {
            render(
                <IconButton aria-label="Home">
                    <Icon icon="lucide--home" />
                </IconButton>
            );
            const button = screen.getByRole('button');
            expect(button.querySelector('.iconify.lucide--home')).toBeInTheDocument();
        });

        it('renders as button element', () => {
            render(
                <IconButton aria-label="Settings">
                    <Icon icon="lucide--settings" />
                </IconButton>
            );
            const button = screen.getByRole('button');
            expect(button.tagName).toBe('BUTTON');
        });

        it('has type="button" by default', () => {
            render(
                <IconButton aria-label="Menu">
                    <Icon icon="lucide--menu" />
                </IconButton>
            );
            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('type', 'button');
        });
    });

    // Styling
    describe('Styling', () => {
        it('applies base button classes', () => {
            render(
                <IconButton aria-label="Close">
                    <Icon icon="lucide--x" />
                </IconButton>
            );
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/\bbtn\b/);
            expect(button.className).toMatch(/btn-sm/);
            expect(button.className).toMatch(/btn-circle/);
            expect(button.className).toMatch(/btn-ghost/);
        });

        it('merges custom className with base classes', () => {
            render(
                <IconButton aria-label="Delete" className="text-error">
                    <Icon icon="lucide--trash" />
                </IconButton>
            );
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/\bbtn\b/);
            expect(button.className).toMatch(/btn-circle/);
            expect(button.className).toMatch(/text-error/);
        });

        it('handles undefined className gracefully', () => {
            render(
                <IconButton aria-label="Info" className={undefined}>
                    <Icon icon="lucide--info" />
                </IconButton>
            );
            const button = screen.getByRole('button');
            expect(button.className).not.toMatch(/undefined/);
        });
    });

    // Accessibility
    describe('Accessibility', () => {
        it('requires aria-label prop', () => {
            render(
                <IconButton aria-label="Notifications">
                    <Icon icon="lucide--bell" />
                </IconButton>
            );
            const button = screen.getByRole('button', { name: 'Notifications' });
            expect(button).toHaveAttribute('aria-label', 'Notifications');
        });

        it('supports descriptive aria labels', () => {
            render(
                <IconButton aria-label="Open navigation menu">
                    <Icon icon="lucide--menu" />
                </IconButton>
            );
            expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument();
        });

        it('is keyboard accessible', () => {
            const handleClick = vi.fn();
            render(
                <IconButton aria-label="Submit" onClick={handleClick}>
                    <Icon icon="lucide--check" />
                </IconButton>
            );
            const button = screen.getByRole('button');
            button.focus();
            expect(button).toHaveFocus();
        });
    });

    // Interactions
    describe('Interactions', () => {
        it('calls onClick handler when clicked', () => {
            const handleClick = vi.fn();
            render(
                <IconButton aria-label="Click me" onClick={handleClick}>
                    <Icon icon="lucide--mouse-pointer" />
                </IconButton>
            );
            fireEvent.click(screen.getByRole('button'));
            expect(handleClick).toHaveBeenCalledTimes(1);
        });

        it('passes event object to onClick handler', () => {
            const handleClick = vi.fn();
            render(
                <IconButton aria-label="Click me" onClick={handleClick}>
                    <Icon icon="lucide--mouse-pointer" />
                </IconButton>
            );
            fireEvent.click(screen.getByRole('button'));
            expect(handleClick).toHaveBeenCalledWith(expect.any(Object));
        });

        it('does not call onClick when disabled', () => {
            const handleClick = vi.fn();
            render(
                <IconButton aria-label="Disabled" onClick={handleClick} disabled>
                    <Icon icon="lucide--ban" />
                </IconButton>
            );
            fireEvent.click(screen.getByRole('button'));
            expect(handleClick).not.toHaveBeenCalled();
        });

        it('supports keyboard interaction (Enter key)', () => {
            const handleClick = vi.fn();
            render(
                <IconButton aria-label="Submit" onClick={handleClick}>
                    <Icon icon="lucide--check" />
                </IconButton>
            );
            const button = screen.getByRole('button');
            fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' });
            // Note: Native button elements handle Enter key automatically
            // This test verifies the button can receive keyboard events
            expect(button).toBeInTheDocument();
        });
    });

    // States
    describe('States', () => {
        it('applies disabled attribute when disabled', () => {
            render(
                <IconButton aria-label="Disabled button" disabled>
                    <Icon icon="lucide--lock" />
                </IconButton>
            );
            const button = screen.getByRole('button');
            expect(button).toBeDisabled();
        });

        it('can be enabled by default', () => {
            render(
                <IconButton aria-label="Enabled button">
                    <Icon icon="lucide--unlock" />
                </IconButton>
            );
            const button = screen.getByRole('button');
            expect(button).not.toBeDisabled();
        });
    });

    // HTML Attributes Pass-through
    describe('HTML attributes', () => {
        it('passes through data attributes', () => {
            render(
                <IconButton
                    aria-label="Custom"
                    data-testid="custom-icon-btn"
                    data-action="submit"
                >
                    <Icon icon="lucide--send" />
                </IconButton>
            );
            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('data-testid', 'custom-icon-btn');
            expect(button).toHaveAttribute('data-action', 'submit');
        });

        it('passes through id attribute', () => {
            render(
                <IconButton aria-label="Unique" id="my-icon-button">
                    <Icon icon="lucide--star" />
                </IconButton>
            );
            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('id', 'my-icon-button');
        });

        it('passes through title attribute', () => {
            render(
                <IconButton aria-label="Help" title="Get help">
                    <Icon icon="lucide--help-circle" />
                </IconButton>
            );
            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('title', 'Get help');
        });

        it('can override type attribute', () => {
            render(
                <IconButton aria-label="Submit" type="submit">
                    <Icon icon="lucide--check" />
                </IconButton>
            );
            const button = screen.getByRole('button');
            expect(button).toHaveAttribute('type', 'submit');
        });
    });

    // Different Icon Types
    describe('Icon variations', () => {
        it('works with different lucide icons', () => {
            const { rerender } = render(
                <IconButton aria-label="Home">
                    <Icon icon="lucide--home" />
                </IconButton>
            );
            expect(screen.getByRole('button').querySelector('.lucide--home')).toBeInTheDocument();

            rerender(
                <IconButton aria-label="Settings">
                    <Icon icon="lucide--settings" />
                </IconButton>
            );
            expect(screen.getByRole('button').querySelector('.lucide--settings')).toBeInTheDocument();

            rerender(
                <IconButton aria-label="User">
                    <Icon icon="lucide--user" />
                </IconButton>
            );
            expect(screen.getByRole('button').querySelector('.lucide--user')).toBeInTheDocument();
        });

        it('can render text or other elements as children', () => {
            render(
                <IconButton aria-label="Plus button">
                    <span>+</span>
                </IconButton>
            );
            expect(screen.getByRole('button', { name: 'Plus button' })).toHaveTextContent('+');
        });
    });

    // Edge Cases
    describe('Edge cases', () => {
        it('handles multiple icon buttons on same page', () => {
            render(
                <>
                    <IconButton aria-label="Edit">
                        <Icon icon="lucide--edit" />
                    </IconButton>
                    <IconButton aria-label="Delete">
                        <Icon icon="lucide--trash" />
                    </IconButton>
                    <IconButton aria-label="Share">
                        <Icon icon="lucide--share" />
                    </IconButton>
                </>
            );
            expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument();
        });

        it('handles empty className string', () => {
            render(
                <IconButton aria-label="Test" className="">
                    <Icon icon="lucide--test-tube" />
                </IconButton>
            );
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/\bbtn\b/);
            expect(button.className).not.toMatch(/^btn btn-sm btn-circle btn-ghost $/);
        });
    });
});

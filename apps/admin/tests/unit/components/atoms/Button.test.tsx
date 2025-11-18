import { describe, it, expect, vi } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '@/components/atoms/Button';

describe('Button', () => {
    // Basic Rendering Tests
    describe('Rendering', () => {
        it('renders without crashing', () => {
            render(<Button>Click me</Button>);
            expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
        });

        it('renders children text correctly', () => {
            render(<Button>Submit Form</Button>);
            expect(screen.getByText('Submit Form')).toBeInTheDocument();
        });

        it('renders as button element by default', () => {
            render(<Button>Button</Button>);
            const button = screen.getByRole('button');
            expect(button.tagName).toBe('BUTTON');
        });

        it('renders with custom tag when specified', () => {
            render(<Button tag="a" href="/test" as any>Link Button</Button>);
            const link = screen.getByRole('link', { name: 'Link Button' });
            expect(link.tagName).toBe('A');
            expect(link).toHaveAttribute('href', '/test');
        });
    });

    // Color Variants
    describe('Colors', () => {
        it('applies primary color class', () => {
            render(<Button color="primary">Primary</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-primary/);
        });

        it('applies secondary color class', () => {
            render(<Button color="secondary">Secondary</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-secondary/);
        });

        it('applies accent color class', () => {
            render(<Button color="accent">Accent</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-accent/);
        });

        it('applies error color class', () => {
            render(<Button color="error">Error</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-error/);
        });

        it('applies success color class', () => {
            render(<Button color="success">Success</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-success/);
        });

        it('applies warning color class', () => {
            render(<Button color="warning">Warning</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-warning/);
        });

        it('applies ghost color class', () => {
            render(<Button color="ghost">Ghost</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-ghost/);
        });
    });

    // Variant Styles
    describe('Variants', () => {
        it('applies solid variant by default (no extra class)', () => {
            render(<Button variant="solid">Solid</Button>);
            const button = screen.getByRole('button');
            expect(button.className).not.toMatch(/btn-solid/);
            expect(button.className).toMatch(/\bbtn\b/);
        });

        it('applies outline variant class', () => {
            render(<Button variant="outline">Outline</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-outline/);
        });

        it('applies dash variant class', () => {
            render(<Button variant="dash">Dash</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-dash/);
        });

        it('applies soft variant class', () => {
            render(<Button variant="soft">Soft</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-soft/);
        });

        it('applies link variant class', () => {
            render(<Button variant="link">Link</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-link/);
        });
    });

    // Sizes
    describe('Sizes', () => {
        it('applies xs size class', () => {
            render(<Button size="xs">Extra Small</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-xs/);
        });

        it('applies sm size class', () => {
            render(<Button size="sm">Small</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-sm/);
        });

        it('applies md size class', () => {
            render(<Button size="md">Medium</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-md/);
        });

        it('applies lg size class', () => {
            render(<Button size="lg">Large</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-lg/);
        });

        it('applies xl size class', () => {
            render(<Button size="xl">Extra Large</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-xl/);
        });
    });

    // Shapes
    describe('Shapes', () => {
        it('applies circle shape class', () => {
            render(<Button shape="circle">+</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-circle/);
        });

        it('applies square shape class', () => {
            render(<Button shape="square">■</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-square/);
        });
    });

    // Width Modifiers
    describe('Width modifiers', () => {
        it('applies wide class', () => {
            render(<Button wide>Wide Button</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-wide/);
        });

        it('applies full width class', () => {
            render(<Button fullWidth>Full Width</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-block/);
        });
    });

    // State Modifiers
    describe('States', () => {
        it('applies active class', () => {
            render(<Button active>Active</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-active/);
        });

        it('applies disabled class', () => {
            render(<Button disabled>Disabled</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-disabled/);
            expect(button).toBeDisabled();
        });

        it('shows loading spinner when loading', () => {
            render(<Button loading>Loading</Button>);
            expect(screen.getByTestId('button-loading')).toBeInTheDocument();
        });

        it('hides startIcon when loading', () => {
            const { rerender } = render(
                <Button startIcon={<span data-testid="start-icon">→</span>}>
                    Submit
                </Button>
            );
            expect(screen.getByTestId('start-icon')).toBeInTheDocument();

            rerender(
                <Button loading startIcon={<span data-testid="start-icon">→</span>}>
                    Submit
                </Button>
            );
            expect(screen.queryByTestId('start-icon')).not.toBeInTheDocument();
            expect(screen.getByTestId('button-loading')).toBeInTheDocument();
        });
    });

    // Icons
    describe('Icons', () => {
        it('renders with start icon', () => {
            render(
                <Button startIcon={<span data-testid="start-icon">←</span>}>
                    Back
                </Button>
            );
            expect(screen.getByTestId('start-icon')).toBeInTheDocument();
        });

        it('renders with end icon', () => {
            render(
                <Button endIcon={<span data-testid="end-icon">→</span>}>
                    Next
                </Button>
            );
            expect(screen.getByTestId('end-icon')).toBeInTheDocument();
        });

        it('renders with both start and end icons', () => {
            render(
                <Button
                    startIcon={<span data-testid="start-icon">←</span>}
                    endIcon={<span data-testid="end-icon">→</span>}
                >
                    Both
                </Button>
            );
            expect(screen.getByTestId('start-icon')).toBeInTheDocument();
            expect(screen.getByTestId('end-icon')).toBeInTheDocument();
        });

        it('adds gap-2 class when startIcon is present', () => {
            render(
                <Button startIcon={<span>→</span>}>
                    With Icon
                </Button>
            );
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/gap-2/);
        });

        it('adds gap-2 class when endIcon is present', () => {
            render(
                <Button endIcon={<span>→</span>}>
                    With Icon
                </Button>
            );
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/gap-2/);
        });
    });

    // Click Interactions
    describe('Interactions', () => {
        it('calls onClick handler when clicked', () => {
            const handleClick = vi.fn();
            render(<Button onClick={handleClick}>Click me</Button>);

            fireEvent.click(screen.getByRole('button', { name: 'Click me' }));
            expect(handleClick).toHaveBeenCalledTimes(1);
        });

        it('does not call onClick when disabled', () => {
            const handleClick = vi.fn();
            render(<Button onClick={handleClick} disabled>Disabled Button</Button>);

            fireEvent.click(screen.getByRole('button', { name: 'Disabled Button' }));
            expect(handleClick).not.toHaveBeenCalled();
        });

        it('passes event object to onClick handler', () => {
            const handleClick = vi.fn();
            render(<Button onClick={handleClick}>Click me</Button>);

            fireEvent.click(screen.getByRole('button'));
            expect(handleClick).toHaveBeenCalledWith(expect.any(Object));
        });
    });

    // Custom className
    describe('Custom styling', () => {
        it('merges custom className with button classes', () => {
            render(<Button className="custom-class">Custom</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/\bbtn\b/);
            expect(button.className).toMatch(/custom-class/);
        });
    });

    // Complex Combinations
    describe('Combined props', () => {
        it('combines color, variant, and size correctly', () => {
            render(
                <Button color="primary" variant="outline" size="lg">
                    Combined
                </Button>
            );
            const button = screen.getByRole('button');
            expect(button.className).toMatch(/btn-primary/);
            expect(button.className).toMatch(/btn-outline/);
            expect(button.className).toMatch(/btn-lg/);
        });

        it('combines loading state with icons', () => {
            render(
                <Button
                    loading
                    startIcon={<span data-testid="start">←</span>}
                    endIcon={<span data-testid="end">→</span>}
                >
                    Loading
                </Button>
            );
            expect(screen.getByTestId('button-loading')).toBeInTheDocument();
            expect(screen.queryByTestId('start')).not.toBeInTheDocument();
            expect(screen.getByTestId('end')).toBeInTheDocument();
        });
    });
});

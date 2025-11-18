import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { Avatar } from '@/components/atoms/Avatar';

describe('Avatar (implicit ring behavior)', () => {
    it('does NOT render ring classes when neither border nor borderColor provided', () => {
        render(<Avatar letters="AB" />);
        const wrapper = screen.getByLabelText('Avatar photo', { selector: 'div' });
        // inner avatar content div
        const inner = wrapper.querySelector('div > div');
        expect(inner?.className).not.toMatch(/\bring\b/);
    });

    it('renders ring + ring-primary when only borderColor provided', () => {
        render(<Avatar letters="CD" borderColor="primary" />);
        const wrapper = screen.getByLabelText('Avatar photo', { selector: 'div' });
        const inner = wrapper.querySelector('div > div');
        expect(inner?.className).toMatch(/\bring\b/);
        expect(inner?.className).toMatch(/ring-primary/);
    });

    it('renders square shape with rounded-none by default when shape="square"', () => {
        render(<Avatar letters="EF" shape="square" />);
        const inner = screen.getByLabelText('Avatar photo').querySelector('div > div');
        expect(inner?.className).toMatch(/rounded-none/);
        expect(inner?.className).not.toMatch(/rounded-full/);
    });

    it('renders circle shape with rounded-full', () => {
        render(<Avatar letters="GH" shape="circle" />);
        const inner = screen.getByLabelText('Avatar photo').querySelector('div > div');
        expect(inner?.className).toMatch(/rounded-full/);
    });
});

import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render } from '@testing-library/react';
import { Avatar } from '@/components/atoms/Avatar';
import { AvatarGroup } from '@/components/molecules/AvatarGroup';

function getInnerDivs(container: HTMLElement): HTMLDivElement[] {
    return Array.from(container.querySelectorAll('.avatar > div')); // inner wrappers inside each avatar container
}

describe('AvatarGroup (implicit ring & propagation)', () => {
    it('applies ring classes to each child when only borderColor provided', () => {
        const { container } = render(
            <AvatarGroup borderColor="info">
                <Avatar letters="AA" />
                <Avatar letters="BB" />
            </AvatarGroup>
        );
        const inners = getInnerDivs(container);
        expect(inners.length).toBe(2);
        for (const el of inners) {
            expect(el.className).toMatch(/\bring\b/);
            expect(el.className).toMatch(/ring-info/);
        }
    });

    it('applies ring to overflow avatar when max triggers collapse', () => {
        const { container } = render(
            <AvatarGroup borderColor="warning" max={2}>
                <Avatar letters="AA" />
                <Avatar letters="BB" />
                <Avatar letters="CC" />
            </AvatarGroup>
        );
        const inners = getInnerDivs(container);
        // With max=2 and 3 children we expect 2 visible avatars: first + overflow
        expect(inners.length).toBe(2);
        // Ensure one of them is +1 overflow placeholder (has +1 text)
        const overflow = inners.find(div => /\+1/.test(div.textContent || ''));
        expect(overflow).toBeTruthy();
        for (const el of inners) {
            expect(el.className).toMatch(/\bring\b/);
            expect(el.className).toMatch(/ring-warning/);
        }
    });
});

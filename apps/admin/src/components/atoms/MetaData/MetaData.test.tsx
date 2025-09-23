import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MetaData } from './';

describe('MetaData', () => {
    it('sets the document title and renders noindex meta', () => {
        render(<MetaData title="Dashboard" noIndex />);
        expect(document.title).toBe('Dashboard | Nexus - Admin & Client Dashboard');
        const meta = document.querySelector('meta[name="robots"][content="noindex"]');
        expect(meta).not.toBeNull();
        expect(meta?.getAttribute('data-rh')).toBe('true');
    });

    it('handles missing title gracefully', () => {
        render(<MetaData />);
        expect(document.title).toBe('Nexus - Admin & Client Dashboard');
    });
});

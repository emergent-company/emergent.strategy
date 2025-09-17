import type { Meta } from '@storybook/react';
import React from 'react';

const meta: Meta = {
    title: 'Chat/Overview',
    parameters: {
        docs: {
            page: () => (
                <>
                    <h1>Chat Components</h1>
                    <p>Building blocks (composer, action bar, CTA cards) for conversational UX.</p>
                    <h2>Architecture</h2>
                    <ul>
                        <li><strong>ChatPromptComposer</strong>: multiline input, privacy toggle, submit.</li>
                        <li><strong>ChatPromptActions</strong>: attach file, privacy toggle, extensible buttons.</li>
                        <li><strong>ChatCtaCard</strong>: contextual guidance on empty / boundary states.</li>
                    </ul>
                    <h2>Usage Guidelines</h2>
                    <ul>
                        <li>Composer placeholder: actionable guidance (e.g., “Let us know what you need…”).</li>
                        <li>Reserve CTA cards for zero-history or upgrade prompts.</li>
                        <li>Icons alone must have accessible labels (<code>aria-label</code>).</li>
                    </ul>
                    <h2>Adding a Chat Component</h2>
                    <pre>
                        <code>{`const meta: Meta<typeof ChatYourComponent> = {
  title: 'Chat/YourComponent',
  component: ChatYourComponent,
  parameters: { docs: { description: { component: 'Short description.' } } },
  tags: ['autodocs']
};
export default meta;`}</code>
                    </pre>
                </>
            ),
        },
    },
    tags: ['autodocs'],
};

export default meta;

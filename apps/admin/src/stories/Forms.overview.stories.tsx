import type { Meta } from '@storybook/react';
import React from 'react';

const meta: Meta = {
    title: 'Forms/Overview',
    parameters: {
        docs: {
            page: () => (
                <>
                    <h1>Form Components</h1>
                    <p>Form utilities and wrappers for consistent input surfaces.</p>
                    <h2>Current Components</h2>
                    <ul>
                        <li>FileUploader</li>
                        <li>(Future) Selects, Date pickers, Validation helpers</li>
                    </ul>
                    <h2>Guidelines</h2>
                    <ul>
                        <li>Always label inputs (visible label or <code>aria-label</code>).</li>
                        <li>Compose small pieces instead of monolith form widgets.</li>
                        <li>Use semantic colors (daisyUI) for error / success states.</li>
                    </ul>
                    <h2>Adding a Form Component</h2>
                    <ol>
                        <li>Implement under <code>src/components/forms/</code>.</li>
                        <li>Add a story file with description + minimal example.</li>
                        <li>Document validation expectations in description or a second story.</li>
                    </ol>
                    <pre>
                        <code>{`const meta: Meta<typeof Component> = {
  title: 'Forms/Component',
  component: Component,
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

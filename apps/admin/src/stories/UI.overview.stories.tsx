import type { Meta } from '@storybook/react';
import React from 'react';

const meta: Meta = {
    title: 'UI/Overview',
    parameters: {
        docs: {
            page: () => (
                <>
                    <h1>UI Components</h1>
                    <p>
                        High‑level overview of core UI primitives. Stories export a direct <code>const meta = {'{'}...{'}'}</code> object
                        (factory removed for CSF index reliability).
                    </p>
                    <h2>Conventions</h2>
                    <ul>
                        <li>Each component lives under <code>UI/ComponentName</code>.</li>
                        <li>Primary story: minimal props. Variants get their own stories.</li>
                        <li>Use lucide icon classes via <code>&lt;span className="iconify lucide--icon-name" /&gt;</code>.</li>
                        <li>Interactive elements need accessible labels.</li>
                    </ul>
                    <h2>Components Covered</h2>
                    <ul>
                        <li>Icon / IconButton</li>
                        <li>Button</li>
                        <li>Tooltip</li>
                        <li>TableEmptyState</li>
                        <li>ThemeToggle</li>
                        <li>PageTitleHero (in Core/)</li>
                    </ul>
                    <h2>Adding a New UI Component</h2>
                    <ol>
                        <li>Create it under <code>src/components/ui/</code>.</li>
                        <li>
                            Add <code>Component.stories.tsx</code> with:
                            <pre>
                                <code>{`const meta: Meta<typeof Component> = {
  title: 'UI/Component',
  component: Component,
  parameters: { docs: { description: { component: 'Short description.' } } },
  tags: ['autodocs']
};
export default meta;`}</code>
                            </pre>
                        </li>
                        <li>Keep description 1–2 sentences.</li>
                        <li>Add variant stories only when they teach (size, state, color).</li>
                    </ol>
                </>
            ),
        },
    },
    tags: ['autodocs'],
};

export default meta;

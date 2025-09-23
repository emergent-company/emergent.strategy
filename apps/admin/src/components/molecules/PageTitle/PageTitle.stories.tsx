import type { Meta, StoryObj } from '@storybook/react';
import { PageTitle, type PageTitleProps } from './index';

const meta: Meta<typeof PageTitle> = {
    title: 'Molecules/PageTitle',
    component: PageTitle,
    // MemoryRouter provided globally in .storybook/preview.tsx – removed local wrapper to prevent nested routers.
    decorators: [
        (Story) => (
            <div className="bg-base-100 p-4">
                <Story />
            </div>
        ),
    ],
    args: {
        title: 'Documents',
        items: [
            { label: 'Home', path: '/admin' },
            { label: 'Documents', active: true },
        ],
    } satisfies Partial<PageTitleProps>,
};
export default meta;

type Story = StoryObj<typeof PageTitle>;

export const Default: Story = {};

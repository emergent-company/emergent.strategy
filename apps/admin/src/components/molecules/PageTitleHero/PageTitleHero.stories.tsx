import type { Meta, StoryObj } from '@storybook/react';
import { PageTitleHero, PageTitleHeroProps } from './index';

const meta: Meta<PageTitleHeroProps> = {
    title: 'Molecules/PageTitleHero',
    component: PageTitleHero,
    parameters: {
        layout: 'centered'
    }
};

export default meta;

type Story = StoryObj<PageTitleHeroProps>;

export const Default: Story = {
    args: {
        title: 'Insights Dashboard',
        description: 'Explore key metrics, trends and performance indicators across your data sources.'
    }
};

export const WithLabel: Story = {
    args: {
        label: 'Production',
        title: 'Customer Analytics',
        description: 'Understand customer behavior and lifecycle patterns to inform growth strategy.'
    }
};

import type { Meta, StoryObj } from '@storybook/react';
import { Footer, FooterProps } from './index';

const meta: Meta<typeof Footer> = {
  title: 'Organisms/Footer',
  component: Footer,
  args: {},
  parameters: {
    docs: {
      description: {
        component:
          'Footer organism presenting global system status dropdown and copyright.',
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="h-[300px] flex flex-col justify-end">
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Footer>;

export const Default: Story = {
  render: (args: FooterProps) => (
    <div className="border border-base-300">
      <Footer {...args} />
    </div>
  ),
};

export const CustomYear: Story = {
  args: { yearOverride: 2030 },
};

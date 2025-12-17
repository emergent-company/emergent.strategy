import type { Meta, StoryObj } from '@storybook/react';
import { Panel } from './Panel';

const meta: Meta<typeof Panel> = {
  title: 'Layouts/Panel',
  component: Panel,
  parameters: {
    docs: {
      description: {
        component: `Layout container with optional header, scrollable content, and footer.
        
Pure layout component - no visual styling (borders, backgrounds, padding).
Use compound components to define structure.`,
      },
      source: { state: 'open' },
    },
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="h-[400px] w-full p-4 bg-base-200">
        <div className="h-full border border-base-300 rounded-lg overflow-hidden">
          <Story />
        </div>
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Panel>
      <Panel.Header>
        <div className="p-4 border-b border-base-300 bg-base-100">
          <h2 className="font-semibold">Panel Header</h2>
        </div>
      </Panel.Header>
      <Panel.Content>
        <div className="p-4 bg-base-100">
          <p className="mb-4">This is scrollable content.</p>
          {Array.from({ length: 20 }).map((_, i) => (
            <p key={i} className="mb-2">
              Content line {i + 1}
            </p>
          ))}
        </div>
      </Panel.Content>
      <Panel.Footer>
        <div className="p-4 border-t border-base-300 bg-base-100">
          <button className="btn btn-primary">Save</button>
        </div>
      </Panel.Footer>
    </Panel>
  ),
};

export const HeaderOnly: Story = {
  render: () => (
    <Panel>
      <Panel.Header>
        <div className="p-4 border-b border-base-300 bg-base-100">
          <h2 className="font-semibold">Just Header</h2>
        </div>
      </Panel.Header>
      <Panel.Content>
        <div className="p-4 bg-base-100">
          <p>Content without footer.</p>
        </div>
      </Panel.Content>
    </Panel>
  ),
};

export const FooterOnly: Story = {
  render: () => (
    <Panel>
      <Panel.Content>
        <div className="p-4 bg-base-100">
          <p>Content without header.</p>
        </div>
      </Panel.Content>
      <Panel.Footer>
        <div className="p-4 border-t border-base-300 bg-base-100 flex gap-2">
          <button className="btn btn-ghost">Cancel</button>
          <button className="btn btn-primary">Submit</button>
        </div>
      </Panel.Footer>
    </Panel>
  ),
};

export const ContentOnly: Story = {
  render: () => (
    <Panel>
      <Panel.Content>
        <div className="p-4 bg-base-100">
          <h2 className="font-semibold mb-4">Just Content</h2>
          <p>
            Panel with only content - no header or footer. The content area
            takes full height and scrolls independently.
          </p>
        </div>
      </Panel.Content>
    </Panel>
  ),
};

export const WithCustomClasses: Story = {
  render: () => (
    <Panel className="bg-primary/5">
      <Panel.Header>
        <div className="p-4 bg-primary text-primary-content">
          <h2 className="font-semibold">Custom Styled</h2>
        </div>
      </Panel.Header>
      <Panel.Content className="bg-base-100">
        <div className="p-4">
          <p>
            You can pass className to Panel and Panel.Content for custom
            styling.
          </p>
        </div>
      </Panel.Content>
    </Panel>
  ),
};

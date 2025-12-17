import type { Meta, StoryObj } from '@storybook/react';
import { SplitPanelLayout } from './SplitPanelLayout';
import { Panel } from '../Panel';

const meta: Meta<typeof SplitPanelLayout> = {
  title: 'Layouts/SplitPanelLayout',
  component: SplitPanelLayout,
  parameters: {
    docs: {
      description: {
        component: `Two equal panels side-by-side with configurable ratio.

Pure layout component - no visual styling. Use compound components to define structure.

Available ratios: '50/50' (default), '40/60', '60/40', '33/67', '67/33', '25/75', '75/25'`,
      },
      source: { state: 'open' },
    },
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="h-[500px] w-full bg-base-200">
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <SplitPanelLayout>
      <SplitPanelLayout.Left>
        <Panel>
          <Panel.Header>
            <div className="p-4 border-b border-base-300 bg-base-100">
              <h2 className="font-semibold">Left Panel (50%)</h2>
            </div>
          </Panel.Header>
          <Panel.Content>
            <div className="p-4 bg-base-100">
              {Array.from({ length: 20 }).map((_, i) => (
                <p key={i} className="mb-2">
                  Left content line {i + 1}
                </p>
              ))}
            </div>
          </Panel.Content>
        </Panel>
      </SplitPanelLayout.Left>
      <SplitPanelLayout.Right>
        <Panel>
          <Panel.Header>
            <div className="p-4 border-b border-base-300 bg-base-100">
              <h2 className="font-semibold">Right Panel (50%)</h2>
            </div>
          </Panel.Header>
          <Panel.Content>
            <div className="p-4 bg-base-100">
              {Array.from({ length: 20 }).map((_, i) => (
                <p key={i} className="mb-2">
                  Right content line {i + 1}
                </p>
              ))}
            </div>
          </Panel.Content>
        </Panel>
      </SplitPanelLayout.Right>
    </SplitPanelLayout>
  ),
};

export const Ratio40_60: Story = {
  name: '40/60 Ratio',
  render: () => (
    <SplitPanelLayout ratio="40/60">
      <SplitPanelLayout.Left>
        <div className="h-full p-4 bg-base-100 border-r border-base-300">
          <h2 className="font-semibold mb-4">40% Panel</h2>
          <p>Smaller left panel.</p>
        </div>
      </SplitPanelLayout.Left>
      <SplitPanelLayout.Right>
        <div className="h-full p-4 bg-base-100">
          <h2 className="font-semibold mb-4">60% Panel</h2>
          <p>Larger right panel.</p>
        </div>
      </SplitPanelLayout.Right>
    </SplitPanelLayout>
  ),
};

export const Ratio33_67: Story = {
  name: '33/67 Ratio',
  render: () => (
    <SplitPanelLayout ratio="33/67">
      <SplitPanelLayout.Left>
        <div className="h-full p-4 bg-base-100 border-r border-base-300">
          <h2 className="font-semibold mb-4">33% Panel</h2>
          <p>One third width.</p>
        </div>
      </SplitPanelLayout.Left>
      <SplitPanelLayout.Right>
        <div className="h-full p-4 bg-base-100">
          <h2 className="font-semibold mb-4">67% Panel</h2>
          <p>Two thirds width.</p>
        </div>
      </SplitPanelLayout.Right>
    </SplitPanelLayout>
  ),
};

export const WithHeader: Story = {
  render: () => (
    <SplitPanelLayout ratio="50/50">
      <SplitPanelLayout.Header>
        <div className="p-4 border-b border-base-300 bg-primary text-primary-content">
          <h1 className="text-lg font-bold">Shared Header</h1>
        </div>
      </SplitPanelLayout.Header>
      <SplitPanelLayout.Left>
        <div className="h-full p-4 bg-base-100 border-r border-base-300 overflow-y-auto">
          <h2 className="font-semibold mb-4">Left Panel</h2>
          <p>Content under shared header.</p>
        </div>
      </SplitPanelLayout.Left>
      <SplitPanelLayout.Right>
        <div className="h-full p-4 bg-base-100 overflow-y-auto">
          <h2 className="font-semibold mb-4">Right Panel</h2>
          <p>Content under shared header.</p>
        </div>
      </SplitPanelLayout.Right>
    </SplitPanelLayout>
  ),
};

export const TemplateStudioExample: Story = {
  name: 'Template Studio Layout',
  render: () => (
    <SplitPanelLayout ratio="50/50">
      <SplitPanelLayout.Left>
        <Panel>
          <Panel.Header>
            <div className="p-4 border-b border-base-300 bg-base-100 flex justify-between items-center">
              <h2 className="font-semibold">Schema Preview</h2>
              <button className="btn btn-ghost btn-sm">Expand</button>
            </div>
          </Panel.Header>
          <Panel.Content>
            <div className="p-4 bg-base-100 font-mono text-sm">
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(
                  {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      description: { type: 'string' },
                    },
                  },
                  null,
                  2
                )}
              </pre>
            </div>
          </Panel.Content>
        </Panel>
      </SplitPanelLayout.Left>
      <SplitPanelLayout.Right>
        <Panel>
          <Panel.Header>
            <div className="p-4 border-b border-base-300 bg-base-100">
              <h2 className="font-semibold">Chat</h2>
            </div>
          </Panel.Header>
          <Panel.Content>
            <div className="p-4 bg-base-100 flex flex-col gap-4">
              <div className="chat chat-start">
                <div className="chat-bubble">
                  Help me create an entity schema for tracking customers.
                </div>
              </div>
              <div className="chat chat-end">
                <div className="chat-bubble chat-bubble-primary">
                  I'll create a Customer entity with name, email, and phone
                  fields.
                </div>
              </div>
            </div>
          </Panel.Content>
          <Panel.Footer>
            <div className="p-4 border-t border-base-300 bg-base-100">
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input input-bordered flex-1"
                  placeholder="Type a message..."
                />
                <button className="btn btn-primary">Send</button>
              </div>
            </div>
          </Panel.Footer>
        </Panel>
      </SplitPanelLayout.Right>
    </SplitPanelLayout>
  ),
};

export const AllRatios: Story = {
  name: 'All Available Ratios',
  decorators: [
    (Story) => (
      <div className="p-4 bg-base-200 space-y-4">
        <Story />
      </div>
    ),
  ],
  render: () => (
    <>
      {(
        ['25/75', '33/67', '40/60', '50/50', '60/40', '67/33', '75/25'] as const
      ).map((ratio) => (
        <div key={ratio} className="h-[100px] border border-base-300 rounded">
          <SplitPanelLayout ratio={ratio}>
            <SplitPanelLayout.Left>
              <div className="h-full p-2 bg-primary/20 flex items-center justify-center">
                {ratio.split('/')[0]}%
              </div>
            </SplitPanelLayout.Left>
            <SplitPanelLayout.Right>
              <div className="h-full p-2 bg-secondary/20 flex items-center justify-center">
                {ratio.split('/')[1]}%
              </div>
            </SplitPanelLayout.Right>
          </SplitPanelLayout>
        </div>
      ))}
    </>
  ),
};

import type { Meta, StoryObj } from '@storybook/react';
import { TwoPanelLayout } from './TwoPanelLayout';
import { Panel } from '../Panel';

const meta: Meta<typeof TwoPanelLayout> = {
  title: 'Layouts/TwoPanelLayout',
  component: TwoPanelLayout,
  parameters: {
    docs: {
      description: {
        component: `Two panels side-by-side with one fixed width.

Pure layout component - no visual styling. Use compound components to define structure.

- \`fixedPanel\`: Which panel has fixed width ('left' | 'right')
- \`fixedWidth\`: Width in pixels or CSS value (e.g., 320, '25%', '20rem')`,
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
    <TwoPanelLayout fixedPanel="left" fixedWidth={280}>
      <TwoPanelLayout.Left>
        <Panel>
          <Panel.Header>
            <div className="p-4 border-b border-base-300 bg-base-100">
              <h2 className="font-semibold">Sidebar (280px)</h2>
            </div>
          </Panel.Header>
          <Panel.Content>
            <div className="p-4 bg-base-100">
              {Array.from({ length: 30 }).map((_, i) => (
                <div
                  key={i}
                  className="p-2 mb-2 rounded bg-base-200 cursor-pointer hover:bg-base-300"
                >
                  Item {i + 1}
                </div>
              ))}
            </div>
          </Panel.Content>
        </Panel>
      </TwoPanelLayout.Left>
      <TwoPanelLayout.Right>
        <Panel>
          <Panel.Header>
            <div className="p-4 border-b border-base-300 bg-base-100">
              <h2 className="font-semibold">Main Content (flex-1)</h2>
            </div>
          </Panel.Header>
          <Panel.Content>
            <div className="p-4 bg-base-100">
              <p className="mb-4">
                The left panel has a fixed width of 280px. This panel takes the
                remaining space.
              </p>
              {Array.from({ length: 20 }).map((_, i) => (
                <p key={i} className="mb-2">
                  Content line {i + 1}
                </p>
              ))}
            </div>
          </Panel.Content>
          <Panel.Footer>
            <div className="p-4 border-t border-base-300 bg-base-100 flex gap-2">
              <button className="btn btn-ghost">Cancel</button>
              <button className="btn btn-primary">Save</button>
            </div>
          </Panel.Footer>
        </Panel>
      </TwoPanelLayout.Right>
    </TwoPanelLayout>
  ),
};

export const FixedRight: Story = {
  render: () => (
    <TwoPanelLayout fixedPanel="right" fixedWidth={320}>
      <TwoPanelLayout.Left>
        <div className="h-full p-4 bg-base-100 border-r border-base-300">
          <h2 className="font-semibold mb-4">Main Content (flex-1)</h2>
          <p>
            This panel takes remaining space. The right panel is fixed at 320px.
          </p>
        </div>
      </TwoPanelLayout.Left>
      <TwoPanelLayout.Right>
        <div className="h-full p-4 bg-base-200">
          <h2 className="font-semibold mb-4">Side Panel (320px)</h2>
          <p>Fixed width panel on the right.</p>
        </div>
      </TwoPanelLayout.Right>
    </TwoPanelLayout>
  ),
};

export const WithHeader: Story = {
  render: () => (
    <TwoPanelLayout fixedPanel="left" fixedWidth={250}>
      <TwoPanelLayout.Header>
        <div className="p-4 border-b border-base-300 bg-primary text-primary-content">
          <h1 className="text-lg font-bold">Shared Header</h1>
        </div>
      </TwoPanelLayout.Header>
      <TwoPanelLayout.Left>
        <div className="h-full p-4 bg-base-100 border-r border-base-300 overflow-y-auto">
          <h2 className="font-semibold mb-4">Navigation</h2>
          {Array.from({ length: 15 }).map((_, i) => (
            <div
              key={i}
              className="p-2 mb-1 rounded hover:bg-base-200 cursor-pointer"
            >
              Menu Item {i + 1}
            </div>
          ))}
        </div>
      </TwoPanelLayout.Left>
      <TwoPanelLayout.Right>
        <div className="h-full p-4 bg-base-100 overflow-y-auto">
          <h2 className="font-semibold mb-4">Content Area</h2>
          <p>The header spans both panels.</p>
        </div>
      </TwoPanelLayout.Right>
    </TwoPanelLayout>
  ),
};

export const PercentageWidth: Story = {
  render: () => (
    <TwoPanelLayout fixedPanel="left" fixedWidth="30%">
      <TwoPanelLayout.Left>
        <div className="h-full p-4 bg-base-100 border-r border-base-300">
          <h2 className="font-semibold mb-4">30% Width</h2>
          <p>Using percentage-based width.</p>
        </div>
      </TwoPanelLayout.Left>
      <TwoPanelLayout.Right>
        <div className="h-full p-4 bg-base-100">
          <h2 className="font-semibold mb-4">70% Width</h2>
          <p>Remaining space.</p>
        </div>
      </TwoPanelLayout.Right>
    </TwoPanelLayout>
  ),
};

export const AIPromptsExample: Story = {
  name: 'AI Prompts Page Layout',
  render: () => (
    <TwoPanelLayout fixedPanel="left" fixedWidth={280}>
      <TwoPanelLayout.Left>
        <Panel>
          <Panel.Header>
            <div className="p-4 border-b border-base-300 bg-base-100">
              <h2 className="font-semibold">Prompts</h2>
            </div>
          </Panel.Header>
          <Panel.Content>
            <div className="bg-base-100">
              {['System Prompt', 'Entity Extraction', 'Chat Response'].map(
                (name, i) => (
                  <div
                    key={i}
                    className={`p-3 border-b border-base-300 cursor-pointer hover:bg-base-200 ${
                      i === 0 ? 'bg-base-200' : ''
                    }`}
                  >
                    <div className="font-medium">{name}</div>
                    <div className="text-sm text-base-content/60">
                      Version 3
                    </div>
                  </div>
                )
              )}
            </div>
          </Panel.Content>
        </Panel>
      </TwoPanelLayout.Left>
      <TwoPanelLayout.Right>
        <Panel>
          <Panel.Header>
            <div className="p-4 border-b border-base-300 bg-base-100 flex justify-between items-center">
              <div>
                <h2 className="font-semibold">System Prompt</h2>
                <p className="text-sm text-base-content/60">Version 3</p>
              </div>
              <span className="badge badge-success">production</span>
            </div>
          </Panel.Header>
          <Panel.Content>
            <div className="p-4 bg-base-100">
              <textarea
                className="textarea textarea-bordered w-full h-64 font-mono text-sm"
                defaultValue="You are a helpful assistant..."
              />
            </div>
          </Panel.Content>
          <Panel.Footer>
            <div className="p-4 border-t border-base-300 bg-base-100 flex justify-between">
              <button className="btn btn-ghost">Reset</button>
              <button className="btn btn-primary">Save to Langfuse</button>
            </div>
          </Panel.Footer>
        </Panel>
      </TwoPanelLayout.Right>
    </TwoPanelLayout>
  ),
};

import type { Meta, StoryObj } from '@storybook/react';
import { TreeRelationshipGraph } from './TreeRelationshipGraph';
import { ReactFlowProvider } from '@xyflow/react';

const meta: Meta<typeof TreeRelationshipGraph> = {
  title: 'Organisms/RelationshipGraph/TreeRelationshipGraph',
  component: TreeRelationshipGraph,
  decorators: [
    (Story) => (
      <ReactFlowProvider>
        <div style={{ width: '100%', height: '600px', background: '#f5f5f5' }}>
          <Story />
        </div>
      </ReactFlowProvider>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: `
Tree-style relationship graph visualization using React Flow.

**Features:**
- Orthogonal (right-angle) edge routing
- Left-to-right tree layout
- Click nodes to expand/collapse
- Double-click to navigate to object details
- Supports bidirectional edges with offset separation
- Same-column edges loop outward to avoid overlap

**Edge Styles:**
- \`orthogonal\` - Right-angle edges (default)
- \`bezier\` - Smooth curved edges

**Note:** This component requires a valid \`objectId\` and makes API calls to 
\`/api/graph/traverse\` to fetch graph data. Stories below demonstrate the component 
with placeholder IDs - in a real environment, valid object IDs would show actual data.
        `,
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    objectId: {
      control: 'text',
      description: 'The object ID to visualize relationships for',
    },
    edgeStyle: {
      control: 'select',
      options: ['orthogonal', 'bezier'],
      description: 'Style of edge rendering',
      table: {
        defaultValue: { summary: 'orthogonal' },
      },
    },
    initialDepth: {
      control: { type: 'number', min: 1, max: 5 },
      description: 'Initial depth of graph expansion',
      table: {
        defaultValue: { summary: '1' },
      },
    },
    showMinimap: {
      control: 'boolean',
      description: 'Show minimap navigation',
      table: {
        defaultValue: { summary: 'false' },
      },
    },
    className: {
      control: 'text',
      description: 'Custom class name for the container',
    },
    onNodeDoubleClick: {
      action: 'nodeDoubleClicked',
      description: 'Called when a node is double-clicked',
    },
  },
};

export default meta;
type Story = StoryObj<typeof TreeRelationshipGraph>;

/**
 * Default orthogonal tree graph.
 *
 * In a connected environment with a valid objectId, this would display
 * an interactive graph with nodes and edges.
 */
export const Default: Story = {
  args: {
    objectId: 'example-object-id',
    edgeStyle: 'orthogonal',
    initialDepth: 1,
    showMinimap: false,
  },
};

/**
 * Bezier edge style with smooth curved edges.
 */
export const BezierEdges: Story = {
  args: {
    objectId: 'example-object-id',
    edgeStyle: 'bezier',
    initialDepth: 1,
    showMinimap: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Uses smooth bezier curves instead of orthogonal right-angles.',
      },
    },
  },
};

/**
 * Graph with deeper initial expansion.
 */
export const DeeperExpansion: Story = {
  args: {
    objectId: 'example-object-id',
    edgeStyle: 'orthogonal',
    initialDepth: 2,
    showMinimap: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Initially expands to depth 2, showing more relationships upfront.',
      },
    },
  },
};

/**
 * Graph with minimap enabled for navigation.
 */
export const WithMinimap: Story = {
  args: {
    objectId: 'example-object-id',
    edgeStyle: 'orthogonal',
    initialDepth: 1,
    showMinimap: true,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Shows the minimap navigation panel in the corner for easier navigation in large graphs.',
      },
    },
  },
};

/**
 * Full configuration example with all options enabled.
 */
export const FullyConfigured: Story = {
  args: {
    objectId: 'example-object-id',
    edgeStyle: 'orthogonal',
    initialDepth: 2,
    showMinimap: true,
    className: 'border border-base-300 rounded-lg',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates all configuration options: deeper expansion, minimap, and custom styling.',
      },
    },
  },
};

/**
 * Interactive demonstration showing double-click behavior.
 *
 * Double-click on any node to trigger the `onNodeDoubleClick` callback.
 * Single click to expand/collapse nodes.
 */
export const Interactive: Story = {
  args: {
    objectId: 'example-object-id',
    edgeStyle: 'orthogonal',
    initialDepth: 1,
    showMinimap: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Double-click any node to trigger the navigation callback. Click once to expand/collapse.',
      },
    },
  },
};

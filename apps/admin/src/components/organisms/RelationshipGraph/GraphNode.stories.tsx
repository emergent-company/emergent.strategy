import type { Meta, StoryObj } from '@storybook/react';
import { GraphNode, GraphNodeComponentProps } from './GraphNode';
import { ReactFlowProvider, ReactFlow } from '@xyflow/react';
import type { GraphNodeData } from './useGraphData';
import '@xyflow/react/dist/style.css';

/**
 * Wrapper to render GraphNode within ReactFlow context
 */
const GraphNodeWrapper = (props: GraphNodeComponentProps) => {
  const node = {
    id: props.id,
    type: 'graphNode',
    position: { x: 100, y: 100 },
    data: props.data,
  };

  const nodeTypes = {
    graphNode: GraphNode,
  };

  return (
    <div style={{ width: '400px', height: '300px' }}>
      <ReactFlow
        nodes={[node]}
        edges={[]}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
};

const meta: Meta<typeof GraphNode> = {
  title: 'Organisms/RelationshipGraph/GraphNode',
  component: GraphNode,
  decorators: [
    (Story) => (
      <ReactFlowProvider>
        <Story />
      </ReactFlowProvider>
    ),
  ],
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component: `
Individual node component for the relationship graph visualization.

**Features:**
- Displays object type icon based on entity type
- Shows node name with truncation for long labels
- Color-coded based on object type
- Status badge (accepted, draft, pending, rejected)
- Expand/collapse indicator for nodes with relationships
- Visual states: root, selected, focused, hovered

**Node States:**
- \`isRoot\` - Primary border styling
- \`selected\` - Ring highlight
- \`isFocused\` - Accent ring with pulse animation
- \`isHovered\` - Warning border with shadow
- \`hasMore\` - Shows expand indicator
        `,
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    id: {
      control: 'text',
      description: 'Unique node identifier',
    },
    data: {
      control: 'object',
      description: 'Node data including label, type, and visual states',
    },
    selected: {
      control: 'boolean',
      description: 'Whether the node is selected',
    },
  },
  render: (args) => <GraphNodeWrapper {...args} />,
};

export default meta;
type Story = StoryObj<typeof GraphNode>;

const baseData: GraphNodeData = {
  label: 'Example Node',
  type: 'Feature',
  hasMore: false,
  isRoot: false,
  depth: 0,
  objectId: 'obj-123',
};

/**
 * Default node appearance
 */
export const Default: Story = {
  args: {
    id: 'node-1',
    data: {
      ...baseData,
      label: 'User Authentication',
      type: 'Feature',
    },
    selected: false,
  },
};

/**
 * Root node with primary styling
 */
export const RootNode: Story = {
  args: {
    id: 'root',
    data: {
      ...baseData,
      label: 'Root Feature',
      type: 'Feature',
      isRoot: true,
    },
    selected: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Root nodes have primary border styling to distinguish them as the focal point.',
      },
    },
  },
};

/**
 * Node with expand indicator showing it has more relationships
 */
export const WithExpandIndicator: Story = {
  args: {
    id: 'node-expandable',
    data: {
      ...baseData,
      label: 'Has Relationships',
      type: 'Requirement',
      hasMore: true,
      relationshipCount: 5,
    },
    selected: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Shows a badge with relationship count when `hasMore` is true.',
      },
    },
  },
};

/**
 * Selected node with ring highlight
 */
export const Selected: Story = {
  args: {
    id: 'node-selected',
    data: {
      ...baseData,
      label: 'Selected Node',
      type: 'Task',
    },
    selected: true,
  },
  parameters: {
    docs: {
      description: {
        story: 'Selected nodes have a ring highlight.',
      },
    },
  },
};

/**
 * Focused node (from search) with accent animation
 */
export const Focused: Story = {
  args: {
    id: 'node-focused',
    data: {
      ...baseData,
      label: 'Search Result',
      type: 'Person',
      isFocused: true,
    },
    selected: false,
  },
  parameters: {
    docs: {
      description: {
        story:
          'Focused nodes (e.g., from search) have an accent ring with pulse animation.',
      },
    },
  },
};

/**
 * Hovered node with warning highlight
 */
export const Hovered: Story = {
  args: {
    id: 'node-hovered',
    data: {
      ...baseData,
      label: 'Hovered Node',
      type: 'Organization',
      isHovered: true,
    },
    selected: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Hovered nodes have a warning border with shadow effect.',
      },
    },
  },
};

/**
 * Node with accepted status
 */
export const AcceptedStatus: Story = {
  args: {
    id: 'node-accepted',
    data: {
      ...baseData,
      label: 'Approved Item',
      type: 'Requirement',
      status: 'accepted',
    },
    selected: false,
  },
};

/**
 * Node with draft status
 */
export const DraftStatus: Story = {
  args: {
    id: 'node-draft',
    data: {
      ...baseData,
      label: 'Draft Item',
      type: 'Decision',
      status: 'draft',
    },
    selected: false,
  },
};

/**
 * Node with pending status
 */
export const PendingStatus: Story = {
  args: {
    id: 'node-pending',
    data: {
      ...baseData,
      label: 'Pending Review',
      type: 'Task',
      status: 'pending',
    },
    selected: false,
  },
};

/**
 * Node with rejected status
 */
export const RejectedStatus: Story = {
  args: {
    id: 'node-rejected',
    data: {
      ...baseData,
      label: 'Rejected Item',
      type: 'Feature',
      status: 'rejected',
    },
    selected: false,
  },
};

/**
 * Node with long label (demonstrates truncation)
 */
export const LongLabel: Story = {
  args: {
    id: 'node-long',
    data: {
      ...baseData,
      label:
        'This is a very long node label that should be truncated to fit within the node width',
      type: 'Document',
    },
    selected: false,
  },
  parameters: {
    docs: {
      description: {
        story: 'Long labels are truncated with ellipsis.',
      },
    },
  },
};

/**
 * Different entity types showing various icons
 */
export const PersonType: Story = {
  args: {
    id: 'node-person',
    data: {
      ...baseData,
      label: 'John Smith',
      type: 'Person',
    },
    selected: false,
  },
};

export const OrganizationType: Story = {
  args: {
    id: 'node-org',
    data: {
      ...baseData,
      label: 'Acme Corporation',
      type: 'Organization',
    },
    selected: false,
  },
};

export const DocumentType: Story = {
  args: {
    id: 'node-doc',
    data: {
      ...baseData,
      label: 'Technical Specification',
      type: 'Document',
    },
    selected: false,
  },
};

export const EventType: Story = {
  args: {
    id: 'node-event',
    data: {
      ...baseData,
      label: 'Sprint Planning',
      type: 'Event',
    },
    selected: false,
  },
};

export const TaskType: Story = {
  args: {
    id: 'node-task',
    data: {
      ...baseData,
      label: 'Implement Login',
      type: 'Task',
    },
    selected: false,
  },
};

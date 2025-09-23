import type { Meta, StoryObj } from '@storybook/react';
import TableEmptyState, { TableEmptyStateProps } from './index';

const meta: Meta<typeof TableEmptyState> = {
    title: 'Molecules/TableEmptyState',
    component: TableEmptyState,
    args: { colSpan: 4, message: 'No data found.' } satisfies Partial<TableEmptyStateProps>,
    argTypes: { colSpan: { control: { type: 'number', min: 1, max: 12 } } },
    parameters: {
        docs: {
            description: { component: 'Inline empty state row for tables. Adjust span with colSpan.' },
        },
    },
};
export default meta;

type Story = StoryObj<typeof meta>;
export const Default: Story = {
    render: (args) => (
        <div className="overflow-x-auto">
            <table className="table w-full">
                <thead>
                    <tr>
                        <th>Col A</th>
                        <th>Col B</th>
                        <th>Col C</th>
                        <th>Col D</th>
                    </tr>
                </thead>
                <tbody>
                    <TableEmptyState {...(args as TableEmptyStateProps)} />
                </tbody>
            </table>
        </div>
    ),
};
export const CustomMessage: Story = { args: { message: 'Nothing to show here yet.' } };

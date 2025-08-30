import type { Meta, StoryObj } from "@storybook/react";
import { TableEmptyState, type TableEmptyStateProps } from "./TableEmptyState";

const meta: Meta<typeof TableEmptyState> = {
    title: "Tables/TableEmptyState",
    component: TableEmptyState,
    argTypes: {
        colSpan: { control: { type: "number", min: 1, max: 12 } },
    },
    args: {
        colSpan: 4,
        message: "No data found.",
    },
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

export default meta;
type Story = StoryObj<typeof TableEmptyState>;

export const Default: Story = {};

export const CustomMessage: Story = {
    args: { message: "Nothing to show here yet." },
};

import type { Meta, StoryObj } from "@storybook/react";
import { MemoryRouter } from "react-router";
import { PageTitle, type IBreadcrumbItem } from "./PageTitle";

const meta = {
    title: "Core/PageTitle",
    component: PageTitle,
    decorators: [
        (Story: React.ComponentType) => (
            <MemoryRouter initialEntries={["/admin"]}>
                <Story />
            </MemoryRouter>
        ),
    ],
    args: {
        title: "Dashboard",
    },
} satisfies Meta<typeof PageTitle>;

export default meta;
type Story = StoryObj<typeof meta>;

const crumbs: IBreadcrumbItem[] = [
    { label: "Home", path: "/admin" },
    { label: "Analytics", path: "/admin/analytics" },
    { label: "Current", active: true },
];

export const WithBreadcrumbs: Story = {
    args: { items: crumbs },
};

export const WithCenterItem: Story = {
    args: {
        items: crumbs,
        centerItem: <span className="badge badge-primary">Center</span>,
    },
};

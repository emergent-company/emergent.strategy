import type { Meta, StoryObj } from "@storybook/react";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { PageTitle, type IBreadcrumbItem } from "./PageTitle";

const meta = {
    title: "Core/PageTitle",
    component: PageTitle,
    decorators: [
        (Story: React.ComponentType) => {
            const NavigateHome = () => {
                const navigate = useNavigate();
                useEffect(() => {
                    navigate("/admin", { replace: true });
                }, [navigate]);
                return null;
            };
            return (
                <>
                    <NavigateHome />
                    <Story />
                </>
            );
        },
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

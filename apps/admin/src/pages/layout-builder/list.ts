import { lazy } from "react";

export const sidebars = [
    {
        title: "Ecommerce",
        comp: lazy(() =>
            import("@/pages/components/layouts/sidebar/EcommerceSidebarDemo").then((module) => ({
                default: module.EcommerceSidebarDemo,
            })),
        ),
    },
    {
        title: "Payment",
        comp: lazy(() =>
            import("@/pages/components/layouts/sidebar/PaymentSidebarDemo").then((module) => ({
                default: module.PaymentSidebarDemo,
            })),
        ),
    },
    {
        title: "Project",
        comp: lazy(() =>
            import("@/pages/components/layouts/sidebar/ProjectSidebarDemo").then((module) => ({
                default: module.ProjectSidebarDemo,
            })),
        ),
    },
    {
        title: "Chat",
        comp: lazy(() =>
            import("@/pages/components/layouts/sidebar/ChatSidebarDemo").then((module) => ({
                default: module.ChatSidebarDemo,
            })),
        ),
    },
    {
        title: "Documentation",
        comp: lazy(() =>
            import("@/pages/components/layouts/sidebar/DocumentationSidebarDemo").then((module) => ({
                default: module.DocumentationSidebarDemo,
            })),
        ),
    },

    {
        title: "Huge Icons",
        comp: lazy(() =>
            import("@/pages/components/layouts/sidebar/HugeIconsSidebarDemo").then((module) => ({
                default: module.HugeIconsSidebarDemo,
            })),
        ),
    },
    {
        title: "Remix Icons",
        comp: lazy(() =>
            import("@/pages/components/layouts/sidebar/RemixIconsSidebarDemo").then((module) => ({
                default: module.RemixIconsSidebarDemo,
            })),
        ),
    },
    {
        title: "Custom Background",
        comp: lazy(() =>
            import("@/pages/components/layouts/sidebar/CustomBackgroundSidebarDemo").then((module) => ({
                default: module.CustomBackgroundSidebarDemo,
            })),
        ),
    },
];

export const topbars = [
    {
        title: "Classic",
        comp: lazy(() =>
            import("@/pages/components/layouts/topbar/ClassicTopbarDemo").then((module) => ({
                default: module.ClassicTopbarDemo,
            })),
        ),
    },
    {
        title: "Greeting",
        comp: lazy(() =>
            import("@/pages/components/layouts/topbar/GreetingTopbarDemo").then((module) => ({
                default: module.GreetingTopbarDemo,
            })),
        ),
    },
    {
        title: "Editor",
        comp: lazy(() =>
            import("@/pages/components/layouts/topbar/EditorTopbarDemo").then((module) => ({
                default: module.EditorTopbarDemo,
            })),
        ),
    },
    {
        title: "Nav Menu 1",
        comp: lazy(() =>
            import("@/pages/components/layouts/topbar/NavMenu1TopbarDemo").then((module) => ({
                default: module.NavMenu1TopbarDemo,
            })),
        ),
    },

    {
        title: "Nav Menu 2",
        comp: lazy(() =>
            import("@/pages/components/layouts/topbar/NavMenu2TopbarDemo").then((module) => ({
                default: module.NavMenu2TopbarDemo,
            })),
        ),
    },

    {
        title: "Custom Background",
        comp: lazy(() =>
            import("@/pages/components/layouts/topbar/CustomBackgroundTopbarDemo").then((module) => ({
                default: module.CustomBackgroundTopbarDemo,
            })),
        ),
    },
];

export const footers = [
    {
        title: "Minimal",
        comp: lazy(() =>
            import("@/pages/components/layouts/footer/MinimalFooterDemo").then((module) => ({
                default: module.MinimalFooterDemo,
            })),
        ),
    },
    {
        title: "Social",
        comp: lazy(() =>
            import("@/pages/components/layouts/footer/SocialFooterDemo").then((module) => ({
                default: module.SocialFooterDemo,
            })),
        ),
    },
    {
        title: "Branding",
        comp: lazy(() =>
            import("@/pages/components/layouts/footer/BrandingFooterDemo").then((module) => ({
                default: module.BrandingFooterDemo,
            })),
        ),
    },
    {
        title: "Legal",
        comp: lazy(() =>
            import("@/pages/components/layouts/footer/LegalFooterDemo").then((module) => ({
                default: module.LegalFooterDemo,
            })),
        ),
    },
    {
        title: "Status",
        comp: lazy(() =>
            import("@/pages/components/layouts/footer/StatusFooterDemo").then((module) => ({
                default: module.StatusFooterDemo,
            })),
        ),
    },

    {
        title: "Support",
        comp: lazy(() =>
            import("@/pages/components/layouts/footer/SupportFooterDemo  ").then((module) => ({
                default: module.SupportFooterDemo,
            })),
        ),
    },

    {
        title: "Options 1",
        comp: lazy(() =>
            import("@/pages/components/layouts/footer/Options1FooterDemo").then((module) => ({
                default: module.Options1FooterDemo,
            })),
        ),
    },
    {
        title: "Options 2",
        comp: lazy(() =>
            import("@/pages/components/layouts/footer/Options2FooterDemo").then((module) => ({
                default: module.Options2FooterDemo,
            })),
        ),
    },
    {
        title: "Custom Background",
        comp: lazy(() =>
            import("@/pages/components/layouts/footer/CustomBackgroundFooterDemo").then((module) => ({
                default: module.CustomBackgroundFooterDemo,
            })),
        ),
    },
];

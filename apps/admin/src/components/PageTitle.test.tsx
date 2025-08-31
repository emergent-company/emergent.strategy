import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { PageTitle, type IBreadcrumbItem } from "@/components/PageTitle";

describe("PageTitle", () => {
    const items: IBreadcrumbItem[] = [
        { label: "Settings", path: "/admin/settings" },
        { label: "Profile", active: true },
    ];

    it("renders title, breadcrumbs and centerItem", () => {
        render(
            <MemoryRouter>
                <PageTitle title="User" items={items} centerItem={<span data-testid="center">X</span>} />
            </MemoryRouter>,
        );

        // Title
        expect(screen.getByText("User")).toBeInTheDocument();

        // Breadcrumbs: root link and trail
        expect(screen.getByRole("link", { name: /nexus/i })).toHaveAttribute("href", "/admin");
        expect(screen.getByRole("link", { name: /settings/i })).toHaveAttribute("href", "/admin/settings");

        // Active crumb rendered as text, with reduced opacity class on li
        const profile = screen.getByText("Profile");
        expect(profile).toBeInTheDocument();
        expect(profile.closest("li")).toHaveClass("opacity-80");

        // Center item
        expect(screen.getByTestId("center")).toBeInTheDocument();
    });
});

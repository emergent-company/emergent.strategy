import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";

describe("IconButton", () => {
    it("renders with base classes and merges custom className", () => {
        render(
            <IconButton aria-label="Open" className="extra">
                <Icon icon="lucide--plus" />
            </IconButton>,
        );

        const btn = screen.getByRole("button", { name: /open/i });
        expect(btn).toBeInTheDocument();
        expect(btn).toHaveClass("btn", "btn-sm", "btn-circle", "btn-ghost");
        expect(btn).toHaveClass("extra");
    });

    it("renders children content (icon)", () => {
        render(
            <IconButton aria-label="Add">
                <Icon icon="lucide--plus" />
            </IconButton>,
        );
        const btn = screen.getByRole("button", { name: /add/i });
        const icon = btn.querySelector(".iconify.lucide--plus");
        expect(icon).not.toBeNull();
    });
});

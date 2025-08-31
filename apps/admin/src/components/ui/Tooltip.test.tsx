import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tooltip } from "@/components/ui/Tooltip";

describe("Tooltip", () => {
    it("renders content and child, defaults to top placement", () => {
        render(
            <Tooltip content={<span>Info</span>}>
                <button>Hover me</button>
            </Tooltip>,
        );

        // content
        expect(screen.getByText("Info")).toBeInTheDocument();
        // child
        expect(screen.getByRole("button", { name: /hover me/i })).toBeInTheDocument();

        const root = screen.getByText("Info").closest(".tooltip");
        expect(root).toHaveClass("tooltip", "tooltip-top");
    });

    it("applies placement classes for bottom/left/right", () => {
        const { rerender } = render(
            <Tooltip content="C" placement="bottom">
                <button>t</button>
            </Tooltip>,
        );
        expect(screen.getByText("C").closest(".tooltip")).toHaveClass("tooltip-bottom");

        rerender(
            <Tooltip content="C" placement="left">
                <button>t</button>
            </Tooltip>,
        );
        expect(screen.getByText("C").closest(".tooltip")).toHaveClass("tooltip-left");

        rerender(
            <Tooltip content="C" placement="right">
                <button>t</button>
            </Tooltip>,
        );
        expect(screen.getByText("C").closest(".tooltip")).toHaveClass("tooltip-right");
    });
});

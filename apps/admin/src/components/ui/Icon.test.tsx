import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon } from "./Icon";

describe("Icon", () => {
    it("renders with lucide class and is aria-hidden by default", () => {
        render(<Icon icon="lucide--home" data-testid="icon" />);
        const el = screen.getByTestId("icon");
        expect(el).toHaveClass("iconify", "lucide--home");
        expect(el).toHaveAttribute("aria-hidden", "true");
    });

    it("sets role=img and aria-label when ariaLabel provided", () => {
        render(<Icon icon="lucide--home" ariaLabel="Home" data-testid="icon" />);
        const el = screen.getByTestId("icon");
        expect(el).toHaveAttribute("role", "img");
        expect(el).toHaveAttribute("aria-label", "Home");
    });
});

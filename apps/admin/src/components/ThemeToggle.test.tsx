import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemeToggle } from "@/components/ThemeToggle";
import { ConfigProvider } from "@/contexts/config";

describe("ThemeToggle", () => {
    it("toggles html data-theme between dark and light", async () => {
        render(
            <ConfigProvider>
                <div>
                    <ThemeToggle />
                </div>
            </ConfigProvider>,
        );

        const btn = screen.getByRole("button", { name: /toggle theme/i });
        expect(btn).toBeInTheDocument();

        // Initially, system theme => no data-theme attribute
        expect(document.documentElement.getAttribute("data-theme")).toBeNull();

        await userEvent.click(btn);
        expect(document.documentElement.getAttribute("data-theme")).toBe("dark");

        await userEvent.click(btn);
        expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
});

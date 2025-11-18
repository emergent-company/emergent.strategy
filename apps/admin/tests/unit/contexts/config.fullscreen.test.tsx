import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ConfigProvider, useConfig } from "@/contexts/config";

describe("config fullscreen", () => {
    it("toggles fullscreen and updates html data-fullscreen attribute", () => {
        // Narrow document type locally to augment Fullscreen API for jsdom
        type DocWithFullscreen = Document & {
            fullscreenElement?: Element | null;
            exitFullscreen?: () => Promise<void> | void;
        };
        type HtmlWithFullscreen = HTMLElement & {
            requestFullscreen?: () => Promise<void> | void;
        };

        const doc = document as DocWithFullscreen;
        const html = document.documentElement as HtmlWithFullscreen;

        const exitFullscreen = vi.fn(async () => {
            doc.fullscreenElement = null;
        });
        const requestFullscreen = vi.fn(async () => {
            doc.fullscreenElement = document.documentElement;
        });

        doc.exitFullscreen = exitFullscreen;
        html.requestFullscreen = requestFullscreen;

        const wrapper = ({ children }: { children: React.ReactNode }) => <ConfigProvider>{children}</ConfigProvider>;
        const { result } = renderHook(() => useConfig(), { wrapper });

        // Initially not fullscreen (jsdom may have undefined here)
        expect((document as DocWithFullscreen).fullscreenElement).toBeFalsy();
        expect(document.documentElement.hasAttribute("data-fullscreen")).toBe(false);

        act(() => result.current.toggleFullscreen());
        expect(requestFullscreen).toHaveBeenCalledTimes(1);
        expect((document as DocWithFullscreen).fullscreenElement).toBe(document.documentElement);
        expect(document.documentElement.hasAttribute("data-fullscreen")).toBe(true);

        act(() => result.current.toggleFullscreen());
        expect(exitFullscreen).toHaveBeenCalledTimes(1);
        expect((document as DocWithFullscreen).fullscreenElement).toBeFalsy();
        expect(document.documentElement.hasAttribute("data-fullscreen")).toBe(false);
    });
});

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ConfigProvider, useConfig } from "@/contexts/config";

describe("config direction", () => {
    it("updates html dir attribute when changeDirection is called", () => {
        const wrapper = ({ children }: { children: React.ReactNode }) => <ConfigProvider>{children}</ConfigProvider>;
        const { result } = renderHook(() => useConfig(), { wrapper });

        // default is ltr
        expect(document.documentElement.dir).toBe("ltr");

        act(() => result.current.changeDirection("rtl"));
        expect(document.documentElement.dir).toBe("rtl");

        act(() => result.current.changeDirection("ltr"));
        expect(document.documentElement.dir).toBe("ltr");
    });
});

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useLocalStorage } from "@/hooks/use-local-storage";

type Example = { a: number; b?: string };

describe("useLocalStorage", () => {
    const KEY = "__TEST_LOCAL_STORAGE__";

    beforeEach(() => {
        window.localStorage.clear();
    });

    it("returns initialValue when localStorage is empty and persists updates", () => {
        const { result } = renderHook(() => useLocalStorage<Example>(KEY, { a: 1 }));
        const [value, setValue] = result.current;
        expect(value).toEqual({ a: 1 });

        act(() => setValue({ a: 2, b: "x" }));
        const [next] = result.current;
        expect(next).toEqual({ a: 2, b: "x" });

        const raw = window.localStorage.getItem(KEY);
        expect(raw).toBeTruthy();
        expect(JSON.parse(raw as string)).toEqual({ a: 2, b: "x" });
    });

    it("merges stored value with provided initialValue shape", () => {
        window.localStorage.setItem(KEY, JSON.stringify({ a: 5 }));
        const { result } = renderHook(() => useLocalStorage<Example>(KEY, { a: 1, b: "fallback" }));
        const [value] = result.current;
        // Stored wins for provided keys, initial fills missing keys
        expect(value).toEqual({ a: 5, b: "fallback" });
    });
});

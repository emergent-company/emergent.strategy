import { useEffect, useRef } from "react";
import Sortable, { Swap } from "sortablejs";

Sortable.mount(new Swap());

export const SwapDemo = () => {
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (wrapperRef.current === null) return;
        new Sortable(wrapperRef.current, {
            swap: true,
            animation: 150,
            ghostClass: "ghost",
            dragClass: "drag",
            swapClass: "p-swap",
        });
    }, []);

    return (
        <div className="border-base-300 divide-base-300 rounded-box divide-y border" ref={wrapperRef}>
            {Array.from({ length: 6 }).map((_, index) => {
                return (
                    <div
                        key={index}
                        className="[&.drag]:bg-base-100 [&.p-swap]:bg-base-200/60 [&.ghost]:bg-base-200/40 border-base-300 [&.drag]:rounded-box w-full px-5 py-2.5 text-start [&.drag]:border">
                        Item {index + 1}
                    </div>
                );
            })}
        </div>
    );
};

import { useEffect, useRef } from "react";
import Sortable from "sortablejs";

export const AnimatedDemo = () => {
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (wrapperRef.current === null) return;
        new Sortable(wrapperRef.current, {
            animation: 150,
            ghostClass: "ghost",
            dragClass: "drag",
        });
    }, []);

    return (
        <div className="border-base-300 divide-base-300 rounded-box divide-y border" ref={wrapperRef}>
            {Array.from({ length: 6 }).map((_, index) => {
                return (
                    <div
                        key={index}
                        className="[&.drag]:bg-base-100 [&.ghost]:motion-preset-shake [&.ghost]:bg-base-200/40 border-base-300 group [&.drag]:rounded-box flex items-center gap-2 px-5 py-2.5 [&.drag]:border">
                        <span
                            data-handle
                            className="iconify lucide--grip-vertical text-base-content/40 group-hover:text-base-content/80 size-4 cursor-grab transition-all"></span>
                        <span>Item {index + 1}</span>
                    </div>
                );
            })}
        </div>
    );
};

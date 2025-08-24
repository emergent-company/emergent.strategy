import { useEffect, useRef } from "react";
import Sortable from "sortablejs";

export const GridHandleDemo = () => {
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (wrapperRef.current === null) return;
        new Sortable(wrapperRef.current, {
            animation: 150,
            ghostClass: "ghost",
            dragClass: "drag",
            handle: "[data-handle]",
        });
    }, []);

    return (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 xl:gap-5" ref={wrapperRef}>
            {Array.from({ length: 14 }).map((_, index) => {
                return (
                    <div
                        key={index}
                        className="bg-base-100 group [&.ghost]:bg-base-200/40 border-base-300 rounded-box relative flex aspect-square cursor-grab items-center justify-center border px-5 py-2.5">
                        Item {index + 1}
                        <span
                            data-handle
                            className="iconify lucide--grip-vertical text-base-content/40 group-hover:text-base-content/80 absolute end-2 top-2 z-1 size-4 cursor-grab transition-all"></span>
                    </div>
                );
            })}
        </div>
    );
};

import { useEffect, useRef } from "react";
import Sortable from "sortablejs";

export const GridDemo = () => {
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 xl:gap-5" ref={wrapperRef}>
            {Array.from({ length: 14 }).map((_, index) => {
                return (
                    <div
                        key={index}
                        className="bg-base-100 [&.ghost]:bg-base-200/40 border-base-300 rounded-box flex aspect-square cursor-grab items-center justify-center border px-5 py-2.5">
                        Item {index + 1}
                    </div>
                );
            })}
        </div>
    );
};

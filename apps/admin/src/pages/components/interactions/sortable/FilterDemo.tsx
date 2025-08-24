import { useEffect, useRef } from "react";
import Sortable from "sortablejs";

export const FilterDemo = () => {
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (wrapperRef.current === null) return;
        new Sortable(wrapperRef.current, {
            animation: 150,
            ghostClass: "ghost",
            dragClass: "drag",
            filter: ".no-sort",
        });
    }, []);

    return (
        <div className="border-base-300 divide-base-300 rounded-box divide-y border" ref={wrapperRef}>
            {Array.from({ length: 6 }).map((_, index) => {
                return (
                    <div
                        key={index}
                        className={`[&.drag]:bg-base-100 [&.ghost]:bg-base-200/40 border-base-300 [&.drag]:rounded-box px-5 py-2.5 [&.drag]:border ${index % 2 == 1 ? "no-sort bg-base-200" : ""}`}>
                        Item {index + 1} {index % 2 == 1 ? "(can't be sorted)" : ""}
                    </div>
                );
            })}
        </div>
    );
};

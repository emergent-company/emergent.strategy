import { useEffect, useRef } from "react";
import Sortable, { MultiDrag } from "sortablejs";

Sortable.mount(new MultiDrag());

export const MultiDragDemo = () => {
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (wrapperRef.current === null) return;
        new Sortable(wrapperRef.current, {
            multiDrag: true,
            animation: 150,
            ghostClass: "ghost",
            dragClass: "drag",
            selectedClass: "selected",
        });
    }, []);

    return (
        <div className="border-base-300 divide-base-300 rounded-box divide-y border" ref={wrapperRef}>
            {Array.from({ length: 6 }).map((_, index) => {
                return (
                    <div
                        key={index}
                        className="[&.drag]:bg-base-100 [&.selected]:bg-base-200/60 [&.ghost]:bg-base-200/40 border-base-300 [&.drag]:rounded-box px-5 py-2.5 [&.drag]:border">
                        Item {index + 1}
                    </div>
                );
            })}
        </div>
    );
};

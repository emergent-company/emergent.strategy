import { useEffect, useRef } from "react";
import Sortable from "sortablejs";

export const SharedDemo = () => {
    const firstRef = useRef<HTMLDivElement | null>(null);
    const secondRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!firstRef.current || !secondRef.current) return;

        new Sortable(firstRef.current, {
            animation: 150,
            group: "shared",
            ghostClass: "ghost",
            dragClass: "drag",
        });
        new Sortable(secondRef.current, {
            animation: 150,
            group: "shared",
            ghostClass: "ghost",
            dragClass: "drag",
        });
    }, []);

    return (
        <div className="grid grid-cols-2 gap-6">
            <div className="border-base-300 divide-base-300 rounded-box h-fit min-h-12 divide-y border" ref={firstRef}>
                {Array.from({ length: 6 }).map((_, index) => {
                    return (
                        <div
                            key={index}
                            className="bg-primary/2 [&.drag]:bg-base-100 [&.ghost]:bg-primary/5 border-base-300 group [&.drag]:rounded-box relative flex items-center gap-2 px-5 py-2.5 [&.drag]:border">
                            <span>Group A - Item {index + 1}</span>
                            <div className="bg-primary/80 absolute start-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-e-xl"></div>
                        </div>
                    );
                })}
            </div>
            <div className="border-base-300 divide-base-300 rounded-box h-fit min-h-12 divide-y border" ref={secondRef}>
                {Array.from({ length: 6 }).map((_, index) => {
                    return (
                        <div
                            key={index}
                            className="bg-secondary/2 [&.drag]:bg-base-100 [&.ghost]:bg-secondary/5 border-base-300 group [&.drag]:rounded-box relative flex items-center gap-2 px-5 py-2.5 [&.drag]:border">
                            <span>Group B - Item {index + 1}</span>
                            <div className="bg-secondary/80 absolute start-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-e-xl"></div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

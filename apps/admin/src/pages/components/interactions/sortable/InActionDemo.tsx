import { useEffect, useRef } from "react";
import Sortable from "sortablejs";

export const InActionDemo = () => {
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
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 xl:gap-5" ref={wrapperRef}>
            {Array.from({ length: 11 }).map((_, index) => {
                return (
                    <div key={index} className="group">
                        <div className="relative aspect-square cursor-grab transition-all duration-500 group-[.ghost]:opacity-60 group-[.ghost]:grayscale-100">
                            <img
                                src={`/images/apps/ecommerce/products/${index + 1}.jpg`}
                                alt="Product 1"
                                className="h-full w-full rounded-md object-cover"
                            />
                            <span className="iconify lucide--grip-vertical absolute end-2 top-2 z-1 size-4 cursor-grab text-black/40 transition-all group-hover:text-black/80"></span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

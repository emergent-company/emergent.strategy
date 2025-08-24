import { useEffect, useRef } from "react";

import { InputSpinner } from "./input-spinner";

export const InActionDemo = () => {
    const inputRef = useRef<HTMLInputElement>(null);
    const spinner = useRef<InputSpinner | null>(null);

    useEffect(() => {
        if (inputRef.current === null) return;
        spinner.current = new InputSpinner(inputRef.current);
        return () => spinner.current?.destroy();
    }, []);

    return (
        <div className="rounded-box relative h-64 max-w-88 overflow-hidden">
            <img src="/images/apps/ecommerce/products/1.jpg" className="size-full object-cover" alt="Images" />
            <div className="rounded-box absolute inset-x-2 bottom-2 border border-white/20 bg-white/40 p-4 text-black backdrop-blur">
                <div className="flex items-end justify-between">
                    <div>
                        <p className="leading-none font-medium">White Sneakers</p>
                        <p className="mt-2 text-lg/none font-semibold">
                            <sup className="opacity-60">$</sup>69
                        </p>
                    </div>
                    <div className="flex items-center gap-1 rounded-full border border-white/25 bg-white/30 px-2 py-1 inset-shadow-xs inset-shadow-white/20">
                        <button
                            className="btn btn-circle btn-xs border-0 bg-white/60 hover:bg-white/80"
                            data-spinner-control="in-action-spinner-demo"
                            data-steps="-1"
                            aria-label="Decrement">
                            <span className="iconify lucide--minus size-4 text-black/80"></span>
                        </button>
                        <input
                            id="in-action-spinner-demo"
                            defaultValue={1}
                            min={0}
                            max={10}
                            ref={inputRef}
                            aria-label="Input"
                            type="number"
                            className="input input-sm input-ghost no-spinner max-w-8 px-0 pe-2.5 text-center text-sm !text-black focus:bg-transparent focus:outline-0"
                        />
                        <button
                            aria-label="Increment"
                            className="btn btn-circle btn-xs hover:bg-whit23e/80 border-0 bg-white/60"
                            data-spinner-control="in-action-spinner-demo">
                            <span className="iconify lucide--plus size-4 text-black/80"></span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

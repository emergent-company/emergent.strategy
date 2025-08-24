import { useEffect, useRef } from "react";

import { InputSpinner } from "./input-spinner";

export const VerticalDemo = () => {
    const inputRef = useRef<HTMLInputElement>(null);
    const spinner = useRef<InputSpinner | null>(null);

    useEffect(() => {
        if (inputRef.current === null) return;
        spinner.current = new InputSpinner(inputRef.current);
        return () => spinner.current?.destroy();
    }, []);

    return (
        <div className="flex items-center justify-center">
            <div className="flex flex-col items-center justify-center gap-1 rounded-full px-0.5 py-1.5 shadow">
                <button
                    className="btn btn-circle btn-ghost btn-sm"
                    aria-label="Increment"
                    data-spinner-control="vertical-spinner-demo">
                    <span className="iconify lucide--chevron-up size-4"></span>
                </button>
                <input
                    id="vertical-spinner-demo"
                    defaultValue={0}
                    ref={inputRef}
                    aria-label="Input"
                    type="number"
                    className="input input-sm no-spinner input-ghost me-2.5 max-w-8 text-center text-sm focus:outline-0"
                />

                <button
                    className="btn btn-circle btn-ghost btn-sm"
                    data-spinner-control="vertical-spinner-demo"
                    data-steps="-1"
                    aria-label="Decrement">
                    <span className="iconify lucide--chevron-down size-4"></span>
                </button>
            </div>
        </div>
    );
};

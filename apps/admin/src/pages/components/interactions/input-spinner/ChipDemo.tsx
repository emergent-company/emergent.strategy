import { useEffect, useRef } from "react";

import { InputSpinner } from "./input-spinner";

export const ChipDemo = () => {
    const inputRef = useRef<HTMLInputElement>(null);
    const spinner = useRef<InputSpinner | null>(null);

    useEffect(() => {
        if (inputRef.current === null) return;
        spinner.current = new InputSpinner(inputRef.current);
        return () => spinner.current?.destroy();
    }, []);

    return (
        <div className="flex items-center justify-center">
            <div className="flex items-center gap-1 rounded-full p-1.5 shadow">
                <button
                    className="btn btn-circle btn-ghost btn-sm"
                    data-spinner-control="chip-spinner-demo"
                    data-steps="-1"
                    aria-label="Decrement">
                    <span className="iconify lucide--minus size-4"></span>
                </button>
                <input
                    id="chip-spinner-demo"
                    defaultValue={0}
                    ref={inputRef}
                    aria-label="Input"
                    type="number"
                    className="input input-sm input-ghost no-spinner me-2.5 max-w-10 text-center text-sm focus:outline-0"
                />
                <button
                    className="btn btn-circle btn-ghost btn-sm"
                    aria-label="Increment"
                    data-spinner-control="chip-spinner-demo">
                    <span className="iconify lucide--plus size-4"></span>
                </button>
            </div>
        </div>
    );
};

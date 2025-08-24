import { useEffect, useRef } from "react";

import { InputSpinner } from "./input-spinner";

export const MinMaxDemo = () => {
    const inputRef = useRef<HTMLInputElement>(null);
    const spinner = useRef<InputSpinner | null>(null);

    useEffect(() => {
        if (inputRef.current === null) return;
        spinner.current = new InputSpinner(inputRef.current);
        return () => spinner.current?.destroy();
    }, []);

    return (
        <div className="join flex items-start justify-center">
            <button
                className="btn border-base-300 btn-outline join-item btn-square"
                data-spinner-control="min-max-spinner-demo"
                data-steps="-1"
                aria-label="Decrement">
                <span className="iconify lucide--minus size-4"></span>
            </button>
            <label className="input join-item input-bordered max-w-48">
                <input
                    id="min-max-spinner-demo"
                    defaultValue={15}
                    min={0}
                    max={100}
                    ref={inputRef}
                    aria-label="Input"
                    type="number"
                    className="no-spinner"
                />
                <span className="iconify lucide--percent text-base-content/80 size-4"></span>
            </label>
            <button
                aria-label="Increment"
                className="btn border-base-300 btn-outline join-item btn-square"
                data-spinner-control="min-max-spinner-demo">
                <span className="iconify lucide--plus size-4"></span>
            </button>
        </div>
    );
};

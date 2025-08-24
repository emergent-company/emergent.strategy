import { useEffect, useRef } from "react";

import { InputSpinner } from "./input-spinner";

export const FractionalDemo = () => {
    const inputRef = useRef<HTMLInputElement>(null);
    const spinner = useRef<InputSpinner | null>(null);

    useEffect(() => {
        if (inputRef.current === null) return;
        spinner.current = new InputSpinner(inputRef.current);
        return () => spinner.current?.destroy();
    }, []);

    return (
        <div className="join flex items-center justify-center">
            <button
                className="btn border-base-300 btn-outline join-item btn-square"
                data-spinner-control="fractional-spinner-demo"
                aria-label="Decrement"
                data-steps="-0.1">
                <span className="iconify lucide--minus size-4"></span>
            </button>
            <label className="input join-item input-bordered max-w-48">
                <span className="iconify lucide--dollar-sign text-base-content/80 size-4"></span>
                <input
                    id="fractional-spinner-demo"
                    step={0.1}
                    defaultValue={9.9}
                    min={0}
                    max={100}
                    ref={inputRef}
                    aria-label="Input"
                    type="number"
                    className="no-spinner"
                />
            </label>
            <button
                className="btn border-base-300 btn-outline join-item btn-square"
                data-steps="0.1"
                aria-label="Increment"
                data-spinner-control="fractional-spinner-demo">
                <span className="iconify lucide--plus size-4"></span>
            </button>
        </div>
    );
};

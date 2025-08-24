import { useEffect, useRef } from "react";

import { InputSpinner } from "./input-spinner";

export const MultiStepsDemo = () => {
    const inputRef = useRef<HTMLInputElement>(null);
    const spinner = useRef<InputSpinner | null>(null);

    useEffect(() => {
        if (inputRef.current === null) return;
        spinner.current = new InputSpinner(inputRef.current);
        return () => spinner.current?.destroy();
    }, []);

    return (
        <div className="flex items-center justify-center gap-2">
            <button className="btn btn-square" data-spinner-control="multi-steps-spinner-demo" data-steps="-5">
                -5
            </button>
            <button
                className="btn btn-square"
                data-spinner-control="multi-steps-spinner-demo"
                data-steps="-1"
                aria-label="Decrement">
                <span className="iconify lucide--minus size-4"></span>
            </button>
            <input
                id="multi-steps-spinner-demo"
                defaultValue={0}
                ref={inputRef}
                aria-label="Input"
                type="number"
                className="input no-spinner input-bordered w-40"
            />
            <button className="btn btn-square" data-spinner-control="multi-steps-spinner-demo" aria-label="Increment">
                <span className="iconify lucide--plus size-4"></span>
            </button>
            <button className="btn btn-square" data-steps="5" data-spinner-control="multi-steps-spinner-demo">
                +5
            </button>
        </div>
    );
};

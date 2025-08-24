import { useEffect, useRef } from "react";

import { InputSpinner } from "./input-spinner";

export const JoinDemo = () => {
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
                className="btn border-base-300 btn-outline btn-square join-item"
                data-spinner-control="join-spinner-demo"
                data-steps="-5">
                -5
            </button>
            <button
                className="btn border-base-300 btn-outline join-item btn-square"
                data-spinner-control="join-spinner-demo"
                data-steps="-1"
                aria-label="Decrement">
                <span className="iconify lucide--minus size-4"></span>
            </button>
            <input
                id="join-spinner-demo"
                defaultValue={0}
                ref={inputRef}
                aria-label="Input"
                type="number"
                className="input no-spinner input-bordered join-item w-40"
            />
            <button
                aria-label="Increment"
                className="btn border-base-300 btn-outline join-item btn-square"
                data-spinner-control="join-spinner-demo">
                <span className="iconify lucide--plus size-4"></span>
            </button>
            <button
                className="btn border-base-300 btn-outline join-item btn-square"
                data-steps="5"
                data-spinner-control="join-spinner-demo">
                +5
            </button>
        </div>
    );
};

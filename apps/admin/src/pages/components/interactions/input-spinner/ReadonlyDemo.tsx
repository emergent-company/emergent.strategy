import { useEffect, useRef } from "react";

import { InputSpinner } from "./input-spinner";

export const ReadonlyDemo = () => {
    const inputRef = useRef<HTMLInputElement>(null);
    const spinner = useRef<InputSpinner | null>(null);

    useEffect(() => {
        if (inputRef.current === null) return;
        spinner.current = new InputSpinner(inputRef.current);
        return () => spinner.current?.destroy();
    }, []);

    return (
        <div className="flex items-center justify-center gap-3">
            <button
                className="btn btn-square"
                data-spinner-control="readonly-spinner-demo"
                data-steps="-1"
                aria-label="Decrement">
                <span className="iconify lucide--minus size-4"></span>
            </button>
            <input
                id="readonly-spinner-demo"
                defaultValue={50}
                ref={inputRef}
                aria-label="Input"
                type="number"
                readOnly
                className="input no-spinner input-bordered w-40"
            />
            <button className="btn btn-square" aria-label="Increment" data-spinner-control="readonly-spinner-demo">
                <span className="iconify lucide--plus size-4"></span>
            </button>
        </div>
    );
};

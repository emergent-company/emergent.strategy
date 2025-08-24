import { useEffect, useRef } from "react";

import { InputSpinner } from "./input-spinner";

export const InlineDemo = () => {
    const inputRef = useRef<HTMLInputElement>(null);
    const spinner = useRef<InputSpinner | null>(null);

    useEffect(() => {
        if (inputRef.current === null) return;
        spinner.current = new InputSpinner(inputRef.current);
        return () => spinner.current?.destroy();
    }, []);

    return (
        <div className="flex items-center justify-center gap-3">
            <label className="input max-w-56 px-2">
                <button
                    className="btn btn-soft btn-circle btn-xs"
                    data-spinner-control="inline-spinner-demo"
                    data-steps="-1"
                    aria-label="Decrement">
                    <span className="iconify lucide--minus size-3.5"></span>
                </button>
                <input
                    className="no-spinner m-0 grow text-center"
                    id="inline-spinner-demo"
                    ref={inputRef}
                    aria-label="Input"
                    defaultValue={1}
                    placeholder="Quantity"
                    type="number"
                />
                <button
                    className="btn btn-soft btn-circle btn-xs"
                    aria-label="Increment"
                    data-spinner-control="inline-spinner-demo">
                    <span className="iconify lucide--plus size-3.5"></span>
                </button>
            </label>
        </div>
    );
};

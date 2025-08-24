import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";
import React, { useEffect, useRef } from "react";

type Instance = flatpickr.Instance;

export const DateDemo = () => {
    const inputRef = useRef<HTMLInputElement>(null);
    const pickerRef = useRef<Instance>(null);

    useEffect(() => {
        const input = inputRef.current;
        if (!input) return;

        pickerRef.current = flatpickr(input, {
            defaultDate: Date.now(),
        });

        return () => pickerRef.current?.destroy();
    }, []);

    return <input className="input max-w-56" aria-label="Choose Date" ref={inputRef} />;
};

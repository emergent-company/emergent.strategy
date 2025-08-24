import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";
import React, { useEffect, useRef } from "react";

type Instance = flatpickr.Instance;

export const DisabledDatesDemo = () => {
    const inputRef = useRef<HTMLInputElement>(null);
    const pickerRef = useRef<Instance>(null);

    useEffect(() => {
        const input = inputRef.current;
        if (!input) return;

        pickerRef.current = flatpickr(input, {
            defaultDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
            inline: true,
            disable: [
                new Date(Date.now() - 24 * 60 * 60 * 1000),
                Date.now(),
                new Date(Date.now() + 24 * 60 * 60 * 1000),
            ],
        });

        return () => pickerRef.current?.destroy();
    }, []);

    return <input className="input max-w-56" aria-label="Choose Date" ref={inputRef} />;
};

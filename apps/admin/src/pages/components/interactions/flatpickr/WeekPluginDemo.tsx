import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";
import weekSelect from "flatpickr/dist/plugins/weekSelect/weekSelect";
import { type Plugin } from "flatpickr/dist/types/options";
import React, { useEffect, useRef } from "react";

type Instance = flatpickr.Instance;

export const WeekPluginDemo = () => {
    const inputRef = useRef<HTMLInputElement>(null);
    const pickerRef = useRef<Instance>(null);

    useEffect(() => {
        const input = inputRef.current;
        if (!input) return;

        pickerRef.current = flatpickr(input, {
            defaultDate: Date.now(),
            plugins: [weekSelect() as Plugin],
        });

        return () => pickerRef.current?.destroy();
    }, [inputRef]);

    return <input className="input max-w-56" aria-label="Choose Date" ref={inputRef} />;
};

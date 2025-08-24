import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";
import monthSelect from "flatpickr/dist/plugins/monthSelect";
import "flatpickr/dist/plugins/monthSelect/style.css";
import { type Plugin } from "flatpickr/dist/types/options";
import React, { useEffect, useRef } from "react";

type Instance = flatpickr.Instance;

export const MonthPluginDemo = () => {
    const inputRef = useRef<HTMLInputElement>(null);
    const pickerRef = useRef<Instance>(null);

    useEffect(() => {
        const input = inputRef.current;
        if (!input) return;

        pickerRef.current = flatpickr(input, {
            defaultDate: Date.now(),
            plugins: [monthSelect() as Plugin],
        });
        return () => pickerRef.current?.destroy();
    }, []);

    return <input className="input max-w-56" aria-label="Choose Date" ref={inputRef} />;
};

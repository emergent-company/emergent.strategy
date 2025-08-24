import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";
import confirmDatePlugin from "flatpickr/dist/plugins/confirmDate/confirmDate";
import "flatpickr/dist/plugins/confirmDate/confirmDate.css";
import React, { useEffect, useRef } from "react";

type Instance = flatpickr.Instance;

export const ConfirmPluginDemo = () => {
    const inputRef = useRef<HTMLInputElement>(null);
    const pickerRef = useRef<Instance>(null);

    useEffect(() => {
        const input = inputRef.current;
        if (!input) return;

        pickerRef.current = flatpickr(input, {
            defaultDate: Date.now(),
            closeOnSelect: false,
            plugins: [
                confirmDatePlugin({
                    confirmIcon: "<span class='iconify lucide--check'></span>",
                    confirmText: "OK",
                    showAlways: true,
                }),
            ],
        });

        return () => pickerRef.current?.destroy();
    }, []);

    return <input className="input max-w-56" aria-label="Choose Date" ref={inputRef} />;
};

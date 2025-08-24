import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";
import React, { useEffect, useRef } from "react";

type Instance = flatpickr.Instance;

export const ControlsDemo = () => {
    const wrapperRef = useRef<HTMLDivElement>(null);
    const pickerRef = useRef<Instance>(null);

    useEffect(() => {
        const input = wrapperRef.current;
        if (!input) return;

        pickerRef.current = flatpickr(input, {
            defaultDate: Date.now(),
            wrap: true,
        });

        return () => pickerRef.current?.destroy();
    }, []);

    return (
        <div className="join" ref={wrapperRef}>
            <input className="input join-item max-w-48" aria-label="Choose Date" data-input />
            <button
                className="btn btn-outline border-base-300 btn-square join-item"
                data-toggle
                aria-label="Toggle calendar">
                <span className="iconify lucide--calendar size-4"></span>
            </button>
            <button
                className="btn btn-outline border-base-300 btn-square join-item btn-error"
                data-clear
                aria-label="Clear date">
                <span className="iconify lucide--x size-4"></span>
            </button>
        </div>
    );
};

import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.css";
import rangePlugin from "flatpickr/dist/plugins/rangePlugin";
import React, { useEffect, useRef } from "react";

type Instance = flatpickr.Instance;

export const RangePluginDemo = () => {
    const input1Ref = useRef<HTMLInputElement>(null);
    const input2Ref = useRef<HTMLInputElement>(null);
    const pickerRef = useRef<Instance>(null);

    useEffect(() => {
        const input1 = input1Ref.current;
        const input2 = input2Ref.current;
        if (!input1 || !input2) return;

        // @ts-ignore
        pickerRef.current = flatpickr(input1, {
            plugins: [
                rangePlugin({
                    input: input2,
                }),
            ],
        });

        return () => pickerRef.current?.destroy();
    }, []);

    return (
        <div className="join">
            <input className="input join-item max-w-32" ref={input1Ref} aria-label="Choose Date" />
            <div className="border-base-300 join-item bg-base-200 text-base-content/80 flex items-center border px-3 font-medium">
                to
            </div>
            <input className="input join-item max-w-32" ref={input2Ref} aria-label="Choose Date" />
        </div>
    );
};

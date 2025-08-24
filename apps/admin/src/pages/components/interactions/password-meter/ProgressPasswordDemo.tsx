import React, { useEffect, useRef } from "react";

import { PasswordMeter } from "./password-meter";

export const ProgressPasswordDemo = () => {
    const passwordRef = useRef<HTMLInputElement | null>(null);
    const passwordMeter = useRef<PasswordMeter | null>(null);

    useEffect(() => {
        if (passwordRef.current === null) return;
        passwordMeter.current = new PasswordMeter(passwordRef.current);

        return () => passwordMeter.current?.destroy();
    }, []);

    return (
        <div className="group max-w-md">
            <fieldset className="fieldset">
                <legend className="fieldset-legend">Password</legend>
                <input
                    className="input w-full"
                    ref={passwordRef}
                    aria-label="Input"
                    placeholder="Type here"
                    type="text"
                />
            </fieldset>
            <div className="mt-2 flex gap-2">
                <div className="bg-base-200 h-1.5 grow overflow-hidden rounded-full">
                    <div className="bg-success h-full w-full origin-left scale-x-0 rounded-full transition-all duration-500 group-has-[[data-pass-p20]]:scale-x-100"></div>
                </div>
                <div className="bg-base-200 h-1.5 grow overflow-hidden rounded-full">
                    <div className="bg-success h-full w-full origin-left scale-x-0 rounded-full transition-all duration-500 group-has-[[data-pass-p40]]:scale-x-100"></div>
                </div>
                <div className="bg-base-200 h-1.5 grow overflow-hidden rounded-full">
                    <div className="bg-success h-full w-full origin-left scale-x-0 rounded-full transition-all duration-500 group-has-[[data-pass-p60]]:scale-x-100"></div>
                </div>
                <div className="bg-base-200 h-1.5 grow overflow-hidden rounded-full">
                    <div className="bg-success h-full w-full origin-left scale-x-0 rounded-full transition-all duration-500 group-has-[[data-pass-p80]]:scale-x-100"></div>
                </div>
                <div className="bg-base-200 h-1.5 grow overflow-hidden rounded-full">
                    <div className="bg-success h-full w-full origin-left scale-x-0 rounded-full transition-all duration-500 group-has-[[data-pass-p100]]:scale-x-100"></div>
                </div>
            </div>
        </div>
    );
};

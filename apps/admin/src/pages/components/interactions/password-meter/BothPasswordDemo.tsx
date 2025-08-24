import React, { useEffect, useRef } from "react";

import { PasswordMeter } from "./password-meter";

export const BothPasswordDemo = () => {
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
            <div className="mt-2 space-y-1">
                <div className="text-base-content/60 group-has-[[data-pass-r1]]:text-success flex items-center gap-2 text-sm transition-all duration-300">
                    <span className="iconify lucide--check size-3.5"></span>
                    <span>At least 8 characters</span>
                </div>
                <div className="text-base-content/60 group-has-[[data-pass-r2][data-pass-r3]]:text-success flex items-center gap-2 text-sm transition-all duration-300">
                    <span className="iconify lucide--check size-3.5"></span>
                    <span>
                        Both <span className="group-has-[[data-pass-r3]]:text-success">uppercase</span> and{" "}
                        <span className="group-has-[[data-pass-r2]]:text-success">lowercase</span> letters
                    </span>
                </div>
                <div className="text-base-content/60 group-has-[[data-pass-r4][data-pass-r5]]:text-success flex items-center gap-2 text-sm transition-all duration-300">
                    <span className="iconify lucide--check size-3.5"></span>
                    <span>
                        Includes a <span className="group-has-[[data-pass-r4]]:text-success">number</span> and a{" "}
                        <span className="group-has-[[data-pass-r5]]:text-success">symbol</span>
                    </span>
                </div>
            </div>
        </div>
    );
};

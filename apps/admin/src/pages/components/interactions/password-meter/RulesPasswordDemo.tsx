import React, { useEffect, useRef } from "react";

import { PasswordMeter } from "./password-meter";

export const RulesPasswordDemo = () => {
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

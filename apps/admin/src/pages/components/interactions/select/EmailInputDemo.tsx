import "choices.js/public/assets/styles/choices.min.css";
import React, { useEffect, useRef } from "react";

export const EmailInputDemo = () => {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const input = inputRef.current;
        if (!input) return;
        import("choices.js").then(({ default: Choices }) => {
            new Choices(input, {
                allowHTML: true,
                editItems: true,
                removeItemButton: true,
                addItemFilter: (value) => {
                    if (!value) return false;

                    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    return new RegExp(regex.source, "i").test(value);
                },
            });
        });
    }, []);

    return <input ref={inputRef} type="text" defaultValue="denish@mail.com" placeholder="Enter something" />;
};

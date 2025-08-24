import "choices.js/public/assets/styles/choices.min.css";
import { useEffect, useRef } from "react";

export const TextInputDemo = () => {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const input = inputRef.current;
        if (!input) return;
        import("choices.js").then(({ default: Choices }) => {
            new Choices(input);
        });
    }, []);

    return <input ref={inputRef} type="text" defaultValue="text-1,text-2" placeholder="Enter something" />;
};

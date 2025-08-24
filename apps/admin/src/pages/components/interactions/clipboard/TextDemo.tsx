import { useRef, useState } from "react";

export const TextDemo = () => {
    const [text, setText] = useState("You can write text and copy to your clipboard");

    const timeout = useRef<NodeJS.Timeout>(null);
    const [isCopied, setIsCopied] = useState(false);

    const copy = async () => {
        setIsCopied(true);
        if (timeout.current) {
            clearTimeout(timeout.current);
        }
        await navigator.clipboard.writeText(text);
        timeout.current = setTimeout(() => {
            setIsCopied(false);
        }, 3000);
    };

    return (
        <div className="max-w-lg grow">
            <textarea
                aria-label="Text area"
                className="textarea w-full"
                value={text}
                onChange={(e) => setText(e.target.value)}
            />
            <div className="group mt-3 text-end" data-copied={isCopied ? "" : undefined}>
                <button className="btn" onClick={copy}>
                    <span className="group-data-copied:hidden">Copy</span>
                    <span className="hidden group-data-copied:block">Copied</span>
                </button>
            </div>
        </div>
    );
};

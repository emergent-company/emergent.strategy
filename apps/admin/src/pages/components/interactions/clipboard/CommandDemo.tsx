import { useRef, useState } from "react";

export const CommandDemo = () => {
    const timeout = useRef<NodeJS.Timeout>(null);
    const [isCopied, setIsCopied] = useState(false);

    const copy = async () => {
        setIsCopied(true);
        if (timeout.current) {
            clearTimeout(timeout.current);
        }
        await navigator.clipboard.writeText("npm i tailwindcss daisyui --save-dev");
        timeout.current = setTimeout(() => {
            setIsCopied(false);
        }, 3000);
    };

    return (
        <div className="border-base-300 rounded-box flex max-w-lg grow items-center gap-2 border px-4 py-2">
            <span className="iconify lucide--terminal size-4.5 opacity-80"></span>
            <p className="grow">
                <span className="text-teal-500">npm</span>
                <span className="text-gray-500"> i</span>
                <span className="text-blue-500"> tailwindcss</span>
                <span className="text-blue-500"> daisyui</span>
                <span className="text-gray-500"> --save-dev</span>
            </p>
            <div
                className="group relative size-5 cursor-pointer transition-all active:scale-95"
                onClick={copy}
                data-copied={isCopied ? "" : undefined}>
                <span className="iconify lucide--copy absolute inset-0 m-auto size-4.5 transition-all duration-300 group-data-copied:scale-0"></span>
                <span className="iconify lucide--check absolute inset-0 m-auto size-4.5 scale-0 transition-all duration-300 group-data-copied:scale-100"></span>
                <div className="bg-base-content/10 rounded-box absolute -inset-1.5 scale-80 opacity-0 transition-all group-hover:scale-100 group-hover:opacity-100"></div>
                <div className="bg-primary text-primary-content rounded-box absolute -end-2 -bottom-6 scale-90 px-2 py-1 text-sm opacity-0 transition-all duration-300 group-data-copied:-bottom-8 group-data-copied:scale-100 group-data-copied:opacity-100">
                    Copied
                </div>
            </div>
        </div>
    );
};

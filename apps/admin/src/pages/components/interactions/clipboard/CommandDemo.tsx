import { useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

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
        <div className="flex items-center gap-2 px-4 py-2 border border-base-300 rounded-box max-w-lg grow">
            <Icon icon="lucide--terminal" className="opacity-80 size-4.5" ariaLabel="Terminal" />
            <p className="grow">
                <span className="text-teal-500">npm</span>
                <span className="text-gray-500"> i</span>
                <span className="text-blue-500"> tailwindcss</span>
                <span className="text-blue-500"> daisyui</span>
                <span className="text-gray-500"> --save-dev</span>
            </p>
            <div
                className="group relative size-5 active:scale-95 transition-all cursor-pointer"
                onClick={copy}
                data-copied={isCopied ? "" : undefined}>
                <Icon icon="lucide--copy" className="absolute inset-0 m-auto size-4.5 group-data-copied:scale-0 transition-all duration-300" ariaLabel="Copy" />
                <Icon icon="lucide--check" className="absolute inset-0 m-auto size-4.5 scale-0 group-data-copied:scale-100 transition-all duration-300" ariaLabel="Copied" />
                <div className="absolute -inset-1.5 bg-base-content/10 opacity-0 group-hover:opacity-100 rounded-box scale-80 group-hover:scale-100 transition-all"></div>
                <div className="-bottom-6 group-data-copied:-bottom-8 absolute bg-primary opacity-0 group-data-copied:opacity-100 px-2 py-1 rounded-box text-primary-content text-sm scale-90 group-data-copied:scale-100 transition-all duration-300 -end-2">
                    Copied
                </div>
            </div>
        </div>
    );
};

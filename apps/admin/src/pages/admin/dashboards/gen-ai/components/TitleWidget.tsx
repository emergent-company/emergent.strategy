import { Icon } from "@/components/ui/Icon";
export const TitleWidget = () => {
    return (
        <div className="flex flex-wrap items-end gap-3 sm:gap-6 xl:gap-12">
            <div className="inline-block bg-clip-text bg-gradient-to-tr from-40% from-base-content to-secondary font-semibold text-transparent text-xl sm:text-3xl tracking-tight">
                <p>Welcome Back, Denish</p>
                <p className="mt-1">Here’s an overview of insights</p>
            </div>
            <div className="flex items-center gap-4">
                <div className="relative">
                    <button className="z-1 relative gap-2 bg-gradient-to-r from-primary to-secondary border-none text-primary-content btn">
                        <Icon icon="lucide--sparkles" className="size-4.5" aria-hidden />
                        <span className="text-base">Ask AI</span>
                    </button>
                    <div className="top-3 absolute inset-x-0 bg-gradient-to-r from-primary to-secondary opacity-40 dark:opacity-20 blur-md rounded-box h-8"></div>
                </div>

                <div className="bg-gradient-to-r from-green-600 via-emerald-500 to-teal-500 p-px rounded-[calc(var(--radius-box)+1px)]">
                    <button className="bg-base-100 text-[15px] btn btn-sm">Analyze Data</button>
                </div>
                <div className="max-sm:hidden bg-gradient-to-r from-cyan-600 via-blue-500 to-indigo-500 p-px rounded-[calc(var(--radius-box)+1px)]">
                    <button className="bg-base-100 text-[15px] btn btn-sm">Get Insights</button>
                </div>
            </div>
        </div>
    );
};

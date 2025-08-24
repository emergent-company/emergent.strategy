export const TitleWidget = () => {
    return (
        <div className="flex flex-wrap items-end gap-3 sm:gap-6 xl:gap-12">
            <div className="from-base-content to-secondary inline-block bg-gradient-to-tr from-40% bg-clip-text text-xl font-semibold tracking-tight text-transparent sm:text-3xl">
                <p>Welcome Back, Denish</p>
                <p className="mt-1">Here’s an overview of insights</p>
            </div>
            <div className="flex items-center gap-4">
                <div className="relative">
                    <button className="btn text-primary-content from-primary to-secondary relative z-1 gap-2 border-none bg-gradient-to-r">
                        <span className="iconify lucide--sparkles size-4.5"></span>
                        <span className="text-base">Ask AI</span>
                    </button>
                    <div className="from-primary to-secondary rounded-box absolute inset-x-0 top-3 h-8 bg-gradient-to-r opacity-40 blur-md dark:opacity-20"></div>
                </div>

                <div className="rounded-[calc(var(--radius-box)+1px)] bg-gradient-to-r from-green-600 via-emerald-500 to-teal-500 p-px">
                    <button className="btn btn-sm bg-base-100 text-[15px]">Analyze Data</button>
                </div>
                <div className="rounded-[calc(var(--radius-box)+1px)] bg-gradient-to-r from-cyan-600 via-blue-500 to-indigo-500 p-px max-sm:hidden">
                    <button className="btn btn-sm bg-base-100 text-[15px]">Get Insights</button>
                </div>
            </div>
        </div>
    );
};

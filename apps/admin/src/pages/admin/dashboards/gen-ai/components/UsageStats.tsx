export const UsageStats = () => {
    return (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <div className="card bg-base-100 h-full cursor-pointer p-4 shadow transition-all hover:shadow-md sm:col-span-2">
                <div className="flex justify-between">
                    <p className="leading-none font-medium">Quick Insights</p>
                    <button className="btn btn-xs btn-ghost btn-circle -m-1">
                        <span className="iconify lucide--pin size-4 text-orange-400"></span>
                    </button>
                </div>
                <div className="mt-3.5 flex h-full items-stretch gap-4 sm:gap-8">
                    <div>
                        <p className="text-2xl font-semibold">
                            <sup className="text-base-content/40 me-0.5 text-lg">$</sup>1245
                            <span className="text-base-content/60 text-xl"></span>
                        </p>
                        <p className="text-base-content/50 mt-auto pt-1 text-center text-sm/none">Today</p>
                    </div>
                    <div className="border-base-300 h-full border-s border-dashed" />
                    <div>
                        <p className="text-2xl font-semibold">
                            <sup className="text-base-content/40 me-0.5 text-lg">$</sup>12.
                            <span className="text-base-content/60 text-xl">74</span> K
                        </p>
                        <p className="text-base-content/50 mt-auto pt-1 text-center text-sm/none">This Month</p>
                    </div>
                    <div className="border-base-300 h-full border-s border-dashed max-sm:hidden" />
                    <div className="max-sm:hidden">
                        <p className="text-2xl font-semibold">
                            +18.4%
                            <span className="text-base-content/60 text-xl"></span>
                        </p>
                        <p className="text-base-content/50 mt-auto pt-1 text-center text-sm/none">Growth</p>
                    </div>
                </div>
            </div>
            <div className="card bg-base-100 cursor-pointer p-4 shadow transition-all hover:shadow-md">
                <div className="flex justify-between">
                    <p className="text-sm/none">Token Consumption</p>
                    <button className="btn btn-xs btn-ghost btn-circle -m-1">
                        <span className="iconify lucide--flame text-base-content/80 size-4"></span>
                    </button>
                </div>
                <p className="mt-2 text-2xl font-medium">18.47 M</p>
                <div className="flex items-end justify-between gap-2">
                    <p className="text-base-content/50 text-sm/none">Higher than usual</p>
                    <div className="bg-base-200 rounded-box p-1">
                        <span className="iconify lucide--chevron-right text-base-content/80 block"></span>
                    </div>
                </div>
            </div>
            <div className="card bg-base-100 cursor-pointer p-4 shadow transition-all hover:shadow-md">
                <div className="flex justify-between">
                    <p className="text-sm/none">AI Model Accuracy</p>
                    <button className="btn btn-xs btn-ghost btn-circle -m-1">
                        <span className="iconify lucide--target text-base-content/80 size-4"></span>
                    </button>
                </div>
                <p className="mt-2 text-2xl font-medium">97.2%</p>
                <div className="flex items-end justify-between gap-2">
                    <p className="text-base-content/50 text-sm/none">Stable performance</p>
                    <div className="bg-base-200 rounded-box p-1">
                        <span className="iconify lucide--chevron-right text-base-content/80 block"></span>
                    </div>
                </div>
            </div>
            <div className="card bg-base-100 cursor-pointer p-4 shadow transition-all hover:shadow-md">
                <div className="flex justify-between">
                    <p className="text-sm/none">Processing Power</p>
                    <button className="btn btn-xs btn-ghost btn-circle -m-1">
                        <span className="iconify lucide--cpu text-base-content/80 size-4"></span>
                    </button>
                </div>
                <p className="mt-2 text-2xl font-medium">
                    96 <span className="text-base">TFLOPS</span>
                </p>
                <div className="flex items-end justify-between gap-2">
                    <p className="text-base-content/50 text-sm/none">Performance at peak</p>
                    <div className="bg-base-200 rounded-box p-1">
                        <span className="iconify lucide--chevron-right text-base-content/80 block"></span>
                    </div>
                </div>
            </div>

            <div className="bg-neutral text-neutral-content card h-full p-3 shadow">
                <p className="text-lg/5.5 font-medium">Supercharge Your AI Capabilities</p>
                <div className="mt-auto flex items-end justify-between gap-3 pt-2">
                    <div>
                        <p className="text-sm/none italic opacity-80">Enhanced AI</p>
                    </div>
                    <button className="btn btn-sm rounded-full">Upgrade</button>
                </div>
            </div>
        </div>
    );
};

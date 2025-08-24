export const StatusCard = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="p-5">
                <div className="flex items-center gap-3">
                    <span className="iconify lucide--heart-pulse size-4"></span>
                    <p className="grow font-medium">System Status</p>
                    <div className="flex items-center gap-3">
                        <span className="text-base-content/60 text-sm italic max-sm:hidden">Fully operational</span>
                        <div className="inline-grid *:[grid-area:1/1]">
                            <div className="status status-success animate-ping"></div>
                            <div className="status status-success"></div>
                        </div>
                    </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="border-base-200 hover:bg-base-200/50 rounded-box cursor-pointer border p-3 transition-all">
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--badge-check text-success size-4.5"></span>
                            <p className="text-sm">API Success Rate</p>
                        </div>
                        <div className="mt-2.5 flex items-end justify-between gap-2">
                            <p className="text-lg/none font-medium">98%</p>
                            <p className="text-success text-sm/none">Stable</p>
                        </div>
                    </div>
                    <div className="border-base-200 hover:bg-base-200/50 rounded-box cursor-pointer border p-3 transition-all">
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--clock text-primary size-4.5"></span>
                            <p className="text-sm">Response Time</p>
                        </div>
                        <div className="mt-2.5 flex items-end justify-between gap-2">
                            <p className="text-lg/none font-medium">200ms</p>
                            <p className="text-primary text-sm/none">Acceptable</p>
                        </div>
                    </div>

                    <div className="border-base-200 hover:bg-base-200/50 rounded-box cursor-pointer border p-3 transition-all">
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--zap text-secondary size-4.5"></span>
                            <p className="text-sm">AI Performance</p>
                        </div>
                        <div className="mt-2.5 flex items-end justify-between gap-2">
                            <p className="text-lg/none font-medium">350 tokens/req</p>
                            <p className="text-secondary text-sm/none">Efficient</p>
                        </div>
                    </div>

                    <div className="border-base-200 hover:bg-base-200/50 rounded-box cursor-pointer border p-3 transition-all">
                        <div className="flex items-center gap-2">
                            <span className="iconify lucide--server text-error size-4.5"></span>
                            <p className="text-sm">Server Load</p>
                        </div>
                        <div className="mt-2.5 flex items-end justify-between gap-2">
                            <p className="text-lg/none font-medium">75%</p>
                            <p className="text-error text-sm/none">High Load</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

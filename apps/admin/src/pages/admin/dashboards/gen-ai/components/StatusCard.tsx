import { Icon } from "@/components/ui/Icon";
export const StatusCard = () => {
    return (
        <div className="bg-base-100 shadow card">
            <div className="p-5">
                <div className="flex items-center gap-3">
                    <Icon icon="lucide--heart-pulse" className="size-4" aria-hidden />
                    <p className="font-medium grow">System Status</p>
                    <div className="flex items-center gap-3">
                        <span className="max-sm:hidden text-sm text-base-content/60 italic">Fully operational</span>
                        <div className="inline-grid *:[grid-area:1/1]">
                            <div className="animate-ping status status-success"></div>
                            <div className="status status-success"></div>
                        </div>
                    </div>
                </div>
                <div className="gap-3 grid sm:grid-cols-2 mt-4">
                    <div className="hover:bg-base-200/50 p-3 border border-base-200 rounded-box transition-all cursor-pointer">
                        <div className="flex items-center gap-2">
                            <Icon icon="lucide--badge-check" className="size-4.5 text-success" aria-hidden />
                            <p className="text-sm">API Success Rate</p>
                        </div>
                        <div className="flex justify-between items-end gap-2 mt-2.5">
                            <p className="font-medium text-lg/none">98%</p>
                            <p className="text-success text-sm/none">Stable</p>
                        </div>
                    </div>
                    <div className="hover:bg-base-200/50 p-3 border border-base-200 rounded-box transition-all cursor-pointer">
                        <div className="flex items-center gap-2">
                            <Icon icon="lucide--clock" className="size-4.5 text-primary" aria-hidden />
                            <p className="text-sm">Response Time</p>
                        </div>
                        <div className="flex justify-between items-end gap-2 mt-2.5">
                            <p className="font-medium text-lg/none">200ms</p>
                            <p className="text-primary text-sm/none">Acceptable</p>
                        </div>
                    </div>

                    <div className="hover:bg-base-200/50 p-3 border border-base-200 rounded-box transition-all cursor-pointer">
                        <div className="flex items-center gap-2">
                            <Icon icon="lucide--zap" className="size-4.5 text-secondary" aria-hidden />
                            <p className="text-sm">AI Performance</p>
                        </div>
                        <div className="flex justify-between items-end gap-2 mt-2.5">
                            <p className="font-medium text-lg/none">350 tokens/req</p>
                            <p className="text-secondary text-sm/none">Efficient</p>
                        </div>
                    </div>

                    <div className="hover:bg-base-200/50 p-3 border border-base-200 rounded-box transition-all cursor-pointer">
                        <div className="flex items-center gap-2">
                            <Icon icon="lucide--server" className="size-4.5 text-error" aria-hidden />
                            <p className="text-sm">Server Load</p>
                        </div>
                        <div className="flex justify-between items-end gap-2 mt-2.5">
                            <p className="font-medium text-lg/none">75%</p>
                            <p className="text-error text-sm/none">High Load</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

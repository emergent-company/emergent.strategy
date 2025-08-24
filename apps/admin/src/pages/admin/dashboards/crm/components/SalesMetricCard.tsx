import { SalesMetricChart } from "./SalesMetricChart";

export const SalesMetricCard = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="card-body px-0 pb-0">
                <div className="px-6">
                    <div className="flex items-center justify-between">
                        <span className="text-lg font-medium">Sale Metrics</span>
                        <span className="text-base-content/60 text-xs">2024 vs. 2025</span>
                    </div>
                    <div className="mt-5 grid h-full grid-cols-2 justify-between gap-6 2xl:grid-cols-3">
                        <div className="flex flex-col items-center">
                            <div className="flex items-center gap-2">
                                <span className="status status-success" />
                                <span className="text-base-content/80 text-sm">Realtime Sales</span>
                            </div>
                            <span className="mt-2 text-2xl font-semibold">541</span>
                            <span className="text-base-content/60 text-xs">494 last hour</span>
                        </div>

                        <div className="flex flex-col items-center">
                            <div className="flex items-center gap-2">
                                <span className="status status-secondary" />
                                <span className="text-base-content/80 text-sm">Revenue</span>
                            </div>
                            <span className="mt-2 text-2xl font-semibold">$51,474</span>
                            <span className="text-base-content/60 text-xs">$49,162 last month</span>
                        </div>

                        <div className="hidden flex-col items-center 2xl:flex">
                            <div className="flex items-center gap-2">
                                <span className="status status-error" />
                                <span className="text-base-content/80 text-sm">Customer Retention</span>
                            </div>
                            <span className="mt-2 text-2xl font-semibold">3.14%</span>
                            <span className="text-base-content/60 text-xs">2.16% last week</span>
                        </div>
                    </div>
                </div>
                <div className="mt-3.5 overflow-hidden rounded-xl ps-5">
                    <SalesMetricChart />
                </div>
            </div>
        </div>
    );
};

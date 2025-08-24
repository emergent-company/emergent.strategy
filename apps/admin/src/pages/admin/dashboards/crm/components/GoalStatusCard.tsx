import { GoalStatusChart } from "./GoalStatusChart";

export const GoalStatusCard = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="card-body pb-3">
                <div>
                    <p className="font-medium">
                        Goal Status <span className="text-success text-sm">(Nearly Finished)</span>
                    </p>
                    <p className="mt-1 text-sm">You&apos;re completed 80% of yearly goal</p>
                    <div className="mt-1">
                        <GoalStatusChart />
                    </div>
                    <div className="mt-3 flex justify-between">
                        <p className="text-sm font-medium">Budget Spent</p>
                        <div>
                            <span className="text-sm font-medium">$22500</span>
                            <span className="text-base-content/60 ms-1 text-xs">/$30000</span>
                        </div>
                    </div>
                    <progress className="progress progress-primary h-1.5" value={0.75} />
                </div>
            </div>
            <hr className="border-base-300 mt-1" />
            <div className="flex justify-between gap-3 p-2.5 px-3">
                <button className="btn btn-primary btn-soft btn-sm">
                    <span className="iconify lucide--pencil size-3.5" />
                    Change Goal
                </button>
                <div className="inline-flex items-center gap-1">
                    <div className="tooltip" data-tip="Download Report">
                        <button className="btn btn-sm btn-ghost btn-square" aria-label="download">
                            <span className="iconify lucide--arrow-down-to-line size-4" />
                        </button>
                    </div>
                    <div className="tooltip" data-tip="Refresh Data">
                        <button className="btn btn-sm btn-ghost btn-square" aria-label="refresh">
                            <span className="iconify lucide--refresh-ccw size-4" />
                        </button>
                    </div>
                    <div className="tooltip" data-tip="Support">
                        <button className="btn btn-sm btn-ghost btn-square" aria-label="help">
                            <span className="iconify lucide--circle-help size-4" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

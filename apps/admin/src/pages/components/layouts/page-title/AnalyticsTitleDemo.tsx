import { Link } from "react-router";

export const AnalyticsTitleDemo = () => {
    return (
        <div className="flex w-full items-center justify-between gap-3">
            <div>
                <p className="text-base-content font-medium sm:text-lg">Analytics Overview</p>
                <div className="text-base-content/60 flex items-center gap-2 text-sm">
                    <Link to="#" className="hover:text-base-content/80 max-sm:hidden">
                        Home
                    </Link>
                    <span className="iconify lucide--chevron-right size-4 max-sm:hidden"></span>
                    <Link to="#" className="hover:text-base-content/80">
                        Dashboard
                    </Link>
                    <span className="iconify lucide--chevron-right size-4"></span>
                    <span className="text-base-content">Analytics</span>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 max-sm:hidden">
                    <label htmlFor="filter" className="text-sm font-medium">
                        Filter
                    </label>
                    <select id="filter" className="select select-sm w-28">
                        <option>Last 7 days</option>
                        <option>This Month</option>
                        <option>Last Month</option>
                        <option>Custom Range</option>
                    </select>
                </div>

                <hr className="border-base-300 h-6 w-px border-e border-dashed max-sm:hidden" />

                <div className="flex items-center gap-2">
                    <button className="btn btn-outline btn-sm border-base-300 max-md:btn-square gap-2">
                        <span className="iconify lucide--download size-4"></span>
                        <span className="max-md:hidden">Export</span>
                    </button>
                    <button className="btn btn-primary btn-sm max-md:btn-square gap-2">
                        <span className="iconify lucide--plus size-4"></span>
                        <span className="max-md:hidden">New Report</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

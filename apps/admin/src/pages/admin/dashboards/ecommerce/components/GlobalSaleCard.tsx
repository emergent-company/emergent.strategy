import { GlobalSaleChart } from "./GlobalSaleChart";

export const GlobalSaleCard = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="card-body gap-0 p-0">
                <div className="flex items-center gap-3 px-5 pt-5">
                    <span className="iconify lucide--globe-2 size-4.5" />
                    <span className="font-medium">Global Sales (%)</span>
                    <button className="btn btn-ghost btn-outline border-base-300 btn-sm z-1 ms-auto">
                        <span className="iconify lucide--eye size-4" />
                        Overview
                    </button>
                </div>
                <div className="me-5 -mt-5 mb-1">
                    <GlobalSaleChart />
                </div>
            </div>
        </div>
    );
};

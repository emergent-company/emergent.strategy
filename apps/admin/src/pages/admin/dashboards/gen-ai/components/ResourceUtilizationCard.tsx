import { ResourceUtilizationChart } from "./ResourceUtilizationChart";

export const ResourceUtilizationCard = () => {
    return (
        <div aria-label="Card" className="card bg-base-100 shadow">
            <div className="card-body p-0">
                <div className="flex items-center gap-3 px-5 pt-5">
                    <span className="iconify lucide--cpu size-4.5" />
                    <span className="font-medium">Resource Utilization</span>
                    <button className="btn btn-outline border-base-300 max-sm:btn-square btn-sm ms-auto">
                        <span className="iconify lucide--bar-chart size-3.5" />
                        <span className="max-sm:hidden">View Report</span>
                    </button>
                </div>
            </div>
            <ResourceUtilizationChart />
        </div>
    );
};

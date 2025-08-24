import { MetaData } from "@/components/MetaData";

import { GlobalTrendsCard } from "./components/GlobalTrendsCard";
import { ModalOverview } from "./components/ModalOverview";
import { ModalsCard } from "./components/ModalsCard";
import { RecentTasksCard } from "./components/RecentTasksCard";
import { ResourceUtilizationCard } from "./components/ResourceUtilizationCard";
import { StatusCard } from "./components/StatusCard";
import { TitleWidget } from "./components/TitleWidget";
import { UsageStats } from "./components/UsageStats";

const EcommerceDashboardPage = () => {
    return (
        <>
            <MetaData title="Gen AI Dashboard" />

            <TitleWidget />
            <div className="mt-6">
                <UsageStats />
            </div>
            <div className="mt-6 grid grid-cols-12 gap-6">
                <div className="col-span-12 xl:col-span-6 2xl:col-span-7">
                    <ModalOverview />
                </div>
                <div className="col-span-12 xl:col-span-6 2xl:col-span-5">
                    <div className="space-y-6">
                        <StatusCard />
                        <ModalsCard />
                    </div>
                </div>
            </div>
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-12">
                <div className="2xl:col-span-3">
                    <GlobalTrendsCard />
                </div>

                <div className="max-2xl:order-2 lg:col-span-2 2xl:col-span-5">
                    <RecentTasksCard />
                </div>
                <div className="max-2xl:order-1 2xl:col-span-4">
                    <ResourceUtilizationCard />
                </div>
            </div>
        </>
    );
};

export default EcommerceDashboardPage;

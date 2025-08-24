import { MetaData } from "@/components/MetaData";
import { PageTitle } from "@/components/PageTitle";

import { CustomerDealsCard } from "./components/CustomerDealsCard";
import { GoalStatusCard } from "./components/GoalStatusCard";
import { PremiumCard } from "./components/PremiumCard";
import { QuickIntegrationCard } from "./components/QuickIntegrationCard";
import { SalesMetricCard } from "./components/SalesMetricCard";
import { SocialAcquisitionCard } from "./components/SocialAcquisitionCard";
import { StatList } from "./components/StatList";

const CRMDashboardPage = () => {
    return (
        <>
            <MetaData title="CRM Dashboard" />

            <PageTitle title="CRM Overview" items={[{ label: "Dashboards" }, { label: "CRM", active: true }]} />
            <div className="mt-6">
                <div className="grid grid-cols-12 gap-5">
                    <div className="col-span-12 md:col-span-4 xl:col-span-3 2xl:col-span-2">
                        <StatList />
                    </div>
                    <div className="col-span-12 md:col-span-8 xl:col-span-6 2xl:col-span-7">
                        <SalesMetricCard />
                    </div>
                    <div className="col-span-12 xl:col-span-3">
                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-1">
                            <div className="col-span-1">
                                <PremiumCard />
                            </div>
                            <div className="col-span-1">
                                <GoalStatusCard />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2 2xl:grid-cols-3">
                    <div className="col-span-1">
                        <SocialAcquisitionCard />
                    </div>
                    <div className="col-span-1">
                        <CustomerDealsCard />
                    </div>

                    <div className="col-span-1">
                        <QuickIntegrationCard />
                    </div>
                </div>
            </div>
        </>
    );
};

export default CRMDashboardPage;

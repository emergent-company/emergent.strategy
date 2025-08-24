import { MetaData } from "@/components/MetaData";
import { PageTitle } from "@/components/PageTitle";

import { OrderTable } from "./OrderTable";

const EcommerceOrdersPage = () => {
    return (
        <>
            <MetaData title="Orders" />
            <PageTitle title="Orders" items={[{ label: "Ecommerce" }, { label: "Orders", active: true }]} />
            <div className="mt-6">
                <OrderTable />
            </div>
        </>
    );
};

export default EcommerceOrdersPage;

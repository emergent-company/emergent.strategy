import { MetaData } from "@/components/MetaData";
import { PageTitle } from "@/components/PageTitle";

import { CustomerTable } from "./CustomerTable";

const EcommerceCustomers = () => {
    return (
        <>
            <MetaData title="Customers" />
            <PageTitle title="Customers" items={[{ label: "Ecommerce" }, { label: "Customers", active: true }]} />
            <div className="mt-6">
                <CustomerTable />
            </div>
        </>
    );
};

export default EcommerceCustomers;

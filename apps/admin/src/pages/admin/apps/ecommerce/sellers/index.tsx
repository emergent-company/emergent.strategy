import { MetaData } from "@/components/MetaData";
import { PageTitle } from "@/components/PageTitle";

import { SellerTable } from "./SellerTable";

const EcommerceSellers = () => {
    return (
        <>
            <MetaData title="Sellers" />

            <PageTitle title="Sellers" items={[{ label: "Ecommerce" }, { label: "Sellers", active: true }]} />

            <div className="mt-6">
                <SellerTable />
            </div>
        </>
    );
};

export default EcommerceSellers;

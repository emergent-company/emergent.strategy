import { MetaData } from "@/components/MetaData";
import { PageTitle } from "@/components/PageTitle";

import { ShopTable } from "./ShopTable";

const EcommerceShops = () => {
    return (
        <>
            <MetaData title="Shops" />

            <PageTitle title="Shops" items={[{ label: "Ecommerce" }, { label: "Shops", active: true }]} />

            <div className="mt-6">
                <ShopTable />
            </div>
        </>
    );
};

export default EcommerceShops;

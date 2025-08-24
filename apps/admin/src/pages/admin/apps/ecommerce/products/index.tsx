import { MetaData } from "@/components/MetaData";
import { PageTitle } from "@/components/PageTitle";

import { ProductTable } from "./ProductTable";

const EcommerceProducts = () => {
    return (
        <>
            <MetaData title="Products" />
            <PageTitle title="Products" items={[{ label: "Ecommerce" }, { label: "Products", active: true }]} />

            <div className="mt-6">
                <ProductTable />
            </div>
        </>
    );
};

export default EcommerceProducts;

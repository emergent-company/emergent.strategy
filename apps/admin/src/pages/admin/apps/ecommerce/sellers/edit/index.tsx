import { MetaData } from "@/components/MetaData";
import { PageTitle } from "@/components/PageTitle";

import { EditSellerForm } from "./EditSellerForm";

const EditSellerPage = () => {
    return (
        <>
            <MetaData title="Edit Seller" />
            <PageTitle
                title="Edit Seller"
                items={[
                    { label: "Sellers", path: "/apps/ecommerce/sellers" },
                    { label: "Edit", active: true },
                ]}
            />
            <div className="mt-6">
                <EditSellerForm />
            </div>
        </>
    );
};

export default EditSellerPage;

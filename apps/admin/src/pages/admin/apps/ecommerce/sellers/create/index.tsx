import { MetaData } from "@/components/MetaData";
import { PageTitle } from "@/components/PageTitle";

import { CreateSellerForm } from "./CreateSellerForm";

const CreateSellerPage = () => {
    return (
        <>
            <MetaData title="Create Seller" />
            <PageTitle
                title="Create Seller"
                items={[
                    { label: "Sellers", path: "/apps/ecommerce/sellers" },
                    { label: "Create", active: true },
                ]}
            />
            <div className="mt-6">
                <CreateSellerForm />
            </div>
        </>
    );
};

export default CreateSellerPage;

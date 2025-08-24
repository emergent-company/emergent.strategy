import { MetaData } from "@/components/MetaData";
import { PageTitle } from "@/components/PageTitle";

import { EditShopForm } from "./EditShopForm";

const EditShopPage = () => {
    return (
        <>
            <MetaData title="Edit Shop" />
            <PageTitle
                title="Edit Shop"
                items={[
                    { label: "Shops", path: "/apps/ecommerce/shops" },
                    { label: "Edit", active: true },
                ]}
            />
            <div className="mt-6">
                <EditShopForm />
            </div>
        </>
    );
};

export default EditShopPage;

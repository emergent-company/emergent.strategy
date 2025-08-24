import { MetaData } from "@/components/MetaData";
import { PageTitle } from "@/components/PageTitle";

import { CreateShopForm } from "./CreateShopForm";

const CreateShopPage = () => {
    return (
        <>
            <MetaData title="Create Shop" />
            <PageTitle
                title="Create Shop"
                items={[
                    { label: "Shops", path: "/apps/ecommerce/shops" },
                    { label: "Create", active: true },
                ]}
            />
            <div className="mt-6">
                <CreateShopForm />
            </div>
        </>
    );
};

export default CreateShopPage;

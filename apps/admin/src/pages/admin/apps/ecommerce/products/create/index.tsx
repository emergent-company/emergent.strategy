import { MetaData } from "@/components/MetaData";
import { PageTitle } from "@/components/PageTitle";

import { CreateProductForm } from "./CreateProductForm";

const CreateProductPage = () => {
    return (
        <>
            <MetaData title="Create Product" />
            <PageTitle
                title="Create Product"
                items={[
                    { label: "Products", path: "/apps/ecommerce/products" },
                    { label: "Create", active: true },
                ]}
            />
            <div className="mt-6">
                <CreateProductForm />
            </div>
        </>
    );
};

export default CreateProductPage;

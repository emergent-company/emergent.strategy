import { MetaData } from "@/components/MetaData";
import { PageTitle } from "@/components/PageTitle";

import { EditProductForm } from "./EditProductForm";

const EditProductPage = () => {
    return (
        <>
            <MetaData title="Edit Product" />
            <PageTitle
                title="Edit Product"
                items={[
                    { label: "Products", path: "/apps/ecommerce/products" },
                    { label: "Edit", active: true },
                ]}
            />
            <div className="mt-6">
                <EditProductForm />
            </div>
        </>
    );
};

export default EditProductPage;

import { MetaData } from "@/components/MetaData";
import { PageTitle } from "@/components/PageTitle";

import { EditCustomerForm } from "./EditCustomerForm";

const EditCustomerPage = () => {
    return (
        <>
            <MetaData title="Edit Customer" />
            <PageTitle
                title="Edit Customer"
                items={[
                    { label: "Customers", path: "/apps/ecommerce/customers" },
                    { label: "Edit", active: true },
                ]}
            />
            <div className="mt-6">
                <EditCustomerForm />
            </div>
        </>
    );
};

export default EditCustomerPage;

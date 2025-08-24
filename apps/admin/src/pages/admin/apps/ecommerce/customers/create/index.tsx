import { MetaData } from "@/components/MetaData";
import { PageTitle } from "@/components/PageTitle";

import { CreateCustomerForm } from "./CreateCustomerForm";

const CreateCustomerPage = () => {
    return (
        <>
            <MetaData title="Create Customer" />
            <PageTitle
                title="Create Customer"
                items={[
                    { label: "Customers", path: "/apps/ecommerce/customers" },
                    { label: "Create", active: true },
                ]}
            />
            <div className="mt-6">
                <CreateCustomerForm />
            </div>
        </>
    );
};

export default CreateCustomerPage;

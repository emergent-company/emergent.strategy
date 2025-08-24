import { MetaData } from "@/components/MetaData";
import { PageTitle } from "@/components/PageTitle";

import { OrderCustomerDetails } from "./components/OrderCustomerDetails";
import { OrderDeliveryAddress } from "./components/OrderDeliveryAddress";
import { OrderDeliveryPartner } from "./components/OrderDeliveryPartner";
import { OrderItemsTable } from "./components/OrderItemsTable";
import { OrderPaymentDetails } from "./components/OrderPaymentDetails";
import { OrderTrack } from "./components/OrderTrack";

const EcommerceOrderPage = () => {
    return (
        <>
            <MetaData title="Edit Order" />
            <PageTitle
                title="Order Detail"
                items={[
                    { label: "Orders", path: "/apps/ecommerce/orders" },
                    { label: "Detail", active: true },
                ]}
            />
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
                <div className="lg:col-span-8 2xl:col-span-9">
                    <OrderItemsTable />
                    <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2 2xl:grid-cols-3">
                        <div>
                            <OrderPaymentDetails />
                        </div>
                        <div>
                            <OrderCustomerDetails />
                        </div>
                        <div>
                            <OrderDeliveryAddress />
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-4 2xl:col-span-3">
                    <div className="card card-border bg-base-100">
                        <div className="card-body gap-0">
                            <p className="bg-base-200 rounded-box px-3 py-2 font-medium">Track Order</p>
                            <div className="mt-2">
                                <OrderTrack />
                            </div>
                            <p className="bg-base-200 rounded-box mt-4 px-3 py-2 font-medium">Delivery Partner</p>
                            <div className="mt-3">
                                <OrderDeliveryPartner />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default EcommerceOrderPage;

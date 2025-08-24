import { CustomerDealTableRow, ICustomerDealTableRow } from "./CustomerDealTableRow";

const customerDealItems: ICustomerDealTableRow[] = [
    {
        image: "/images/avatars/1.png",
        name: "John Doe",
        date: "16 Dec",
        status: "completed",
        value: "50,000",
    },
    {
        image: "/images/avatars/2.png",
        name: "Jane Smith",
        date: "21 June",
        status: "pending",
        value: "12,240",
    },
    {
        image: "/images/avatars/3.png",
        name: "Rahul Kumar",
        date: "15 Aug",
        status: "completed",
        value: "87,452",
    },
    {
        image: "/images/avatars/4.png",
        name: "Emily Davis",
        date: "17 Nov",
        status: "completed",
        value: "65,357",
    },
    {
        image: "/images/avatars/5.png",
        name: "Akash Singh",
        date: "30 Jan",
        status: "canceled",
        value: "35,769",
    },
];

export const CustomerDealsCard = () => {
    return (
        <>
            <div aria-label="Card" className="card bg-base-100 shadow">
                <div className="card-body p-0">
                    <div className="flex items-center justify-between gap-2 px-5 pt-5">
                        <span className="iconify lucide--handshake text-base-content/80 size-4.5" />
                        <span className="grow font-medium">Customer Deals</span>
                        <button className="btn btn-outline border-base-300 btn-sm">
                            <span className="iconify lucide--plus size-3.5" />
                            Make a Deal
                        </button>
                    </div>
                    <div className="mt-1 overflow-auto">
                        <table className="table *:text-nowrap">
                            <thead>
                                <tr>
                                    <th>Customer</th>
                                    <th>Value</th>
                                    <th>Status</th>
                                    <th>Date</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {customerDealItems.map((recentOrder, index) => (
                                    <CustomerDealTableRow {...recentOrder} key={index} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </>
    );
};

import { IOrderItemsTableRow, OrderItemsTableRow } from "./OrderItemsTableRow";

const orderItems: IOrderItemsTableRow[] = [
    {
        id: 1001,
        image: "/images/apps/ecommerce/products/1.jpg",
        name: "Men's tracking shoes",
        sku: "SHOES",
        category: "Fashion",
        price: 29,
        quantity: 3,
        totalAmount: 87,
    },
    {
        id: 1002,
        image: "/images/apps/ecommerce/products/2.jpg",
        name: "Coco body oil",
        sku: "COCOOIL",
        category: "Daily Need",
        price: 16,
        quantity: 2,
        totalAmount: 32,
    },
    {
        id: 1003,
        image: "/images/apps/ecommerce/products/3.jpg",
        name: "Freeze air",
        sku: "FREEAIR",
        category: "Cosmetic",
        price: 32,
        quantity: 4,
        totalAmount: 128,
    },
];

export const OrderItemsTable = () => {
    return (
        <div className="card card-border bg-base-100">
            <div className="card-body p-0">
                <div className="px-5 pt-5">
                    <div className="flex justify-between">
                        <div className="space-x-2">
                            <span className="text-2xl font-medium">#1</span>
                            <span className="text-base-content/70 hidden text-sm sm:inline">
                                27 Dec 2024 at 05:26 PM
                            </span>
                        </div>
                        <button className="btn btn-sm btn-outline border-base-300">
                            <span className="iconify lucide--scroll-text size-3.5" />
                            Invoice
                        </button>
                    </div>
                </div>
                <div className="mt-5 overflow-auto">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Name</th>
                                <th>Category</th>
                                <th>Price</th>
                                <th>Quantity</th>
                                <th>Amount</th>
                            </tr>
                        </thead>

                        <tbody>
                            {orderItems.map((orderItem) => (
                                <OrderItemsTableRow {...orderItem} key={orderItem.id} />
                            ))}
                            <tr className="font-medium">
                                <td colSpan={5} className="text-end">
                                    Sub Total
                                </td>
                                <td>$247</td>
                            </tr>
                            <tr className="font-medium">
                                <td colSpan={5} className="text-end">
                                    Tax
                                </td>
                                <td>+ $44</td>
                            </tr>
                            <tr className="text-success font-medium">
                                <td colSpan={5} className="text-end">
                                    Discount
                                </td>
                                <td className="text-success">- $60</td>
                            </tr>
                            <tr className="text-lg">
                                <td colSpan={5} className="text-end font-medium">
                                    Total
                                </td>
                                <td className="font-semibold">$231</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

import { Link } from "react-router";

export type IOrderTableRow = {
    id: number;
    itemsCount: number;
    customerName: string;
    totalAmount: number;
    paymentStatus: "paid" | "pending";
    orderStatus: string;
    orderDate: string;
};

export const OrderTableRow = ({
    id,
    itemsCount,
    customerName,
    totalAmount,
    paymentStatus,
    orderStatus,
    orderDate,
}: IOrderTableRow) => {
    return (
        <tr className="hover:bg-base-200/40 cursor-pointer *:text-nowrap">
            <th className="px-6">
                <input
                    aria-label={`Select order ${id}`}
                    type="checkbox"
                    data-slot="single-checkbox"
                    className="checkbox checkbox-sm"
                />
            </th>
            <td className="font-medium">#{id}</td>
            <td>{itemsCount} Items</td>
            <td>{customerName}</td>
            <td className="text-sm font-medium">${totalAmount}</td>
            <td>
                {paymentStatus == "paid" ? (
                    <div aria-label="Badge" className="badge badge-soft badge-success">
                        Paid
                    </div>
                ) : (
                    <div aria-label="Badge" className="badge badge-soft badge-error">
                        Pending
                    </div>
                )}
            </td>
            <td className="text-sm">{orderStatus}</td>
            <td className="text-sm">{orderDate}</td>
            <td>
                <Link aria-label={`View order ${id}`} to={`/apps/ecommerce/orders/${id}`}>
                    <button aria-label={`View order ${id}`} className="btn btn-square btn-ghost btn-sm">
                        <span className="iconify lucide--eye text-base-content/80 size-4" />
                    </button>
                </Link>
            </td>
        </tr>
    );
};

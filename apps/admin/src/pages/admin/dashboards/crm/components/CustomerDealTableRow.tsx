export type ICustomerDealTableRow = {
    image: string;
    name: string;
    date: string;
    status: "completed" | "canceled" | "pending";
    value: string;
};

export const CustomerDealTableRow = ({ date, status, name, image, value }: ICustomerDealTableRow) => {
    return (
        <tr>
            <td className="flex items-center space-x-3 truncate">
                <img alt="Order" className="mask mask-squircle bg-base-200 size-7" src={image} />
                <p>{name}</p>
            </td>
            <td className="font-medium">${value}</td>
            <td>
                {status == "completed" && <div className="badge badge-success badge-sm badge-soft">Completed</div>}
                {status == "canceled" && <div className="badge badge-error badge-sm badge-soft">Canceled</div>}
                {status == "pending" && <div className="badge badge-secondary badge-sm badge-soft">Pending</div>}
            </td>
            <td className="text-base-content/80 text-sm">{date}</td>
            <td>
                <button aria-label="Show product" className="btn btn-square btn-ghost btn-xs">
                    <span className="iconify lucide--eye text-base-content/80 size-4" />
                </button>
            </td>
        </tr>
    );
};

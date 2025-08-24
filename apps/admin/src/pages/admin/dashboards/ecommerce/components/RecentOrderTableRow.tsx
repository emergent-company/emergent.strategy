export type IRecentOrderTableRow = {
    image: string;
    name: string;
    price: number;
    date: string;
    status: "delivered" | "on_going" | "confirmed" | "canceled" | "waiting";
};

export const RecentOrderTableRow = ({ image, price, status, date, name }: IRecentOrderTableRow) => {
    return (
        <tr>
            <th>
                <input aria-label="checked-order" type="checkbox" className="checkbox checkbox-sm" />
            </th>
            <td className="flex items-center space-x-3 truncate">
                <img alt="order image" className="mask mask-squircle bg-base-200 size-7.5" src={image} />
                <p>{name}</p>
            </td>
            <td className="font-medium">${price}</td>
            <td className="text-xs">{date}</td>
            <td>
                {status == "delivered" && <div className="badge badge-success badge-sm badge-soft">Delivered</div>}
                {status == "on_going" && <div className="badge badge-info badge-sm badge-soft">On Going</div>}
                {status == "confirmed" && <div className="badge badge-primary badge-sm badge-soft">Confirmed</div>}
                {status == "canceled" && <div className="badge badge-error badge-sm badge-soft">Canceled</div>}
                {status == "waiting" && <div className="badge badge-secondary badge-sm badge-soft">Waiting</div>}
            </td>
            <td>
                <div className="flex items-center gap-1">
                    <button aria-label="Show product" className="btn btn-square btn-ghost btn-xs">
                        <span className="iconify lucide--eye text-base-content/60 size-4" />
                    </button>
                    <button
                        aria-label="Show product"
                        className="btn btn-square btn-error btn-outline btn-xs border-transparent">
                        <span className="iconify lucide--trash size-4" />
                    </button>
                </div>
            </td>
        </tr>
    );
};

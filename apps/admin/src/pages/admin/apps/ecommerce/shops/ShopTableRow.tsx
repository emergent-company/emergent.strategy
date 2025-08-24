import { Link } from "react-router";

export type IShopTableRow = {
    id: number;
    name: string;
    date: string;
    sellerId: number;
    sellerName: string;
    email: string;
    mobileNumber: string;
    verified: boolean;
    ratings: number;
    ratingsCount: number;
    orders: number;
    earning: number;
};

export const ShopTableRow = ({
    id,
    name,
    date,
    email,
    earning,
    verified,
    ratings,
    ratingsCount,
    orders,
    sellerName,
    mobileNumber,
}: IShopTableRow) => {
    return (
        <>
            <tr className="hover:bg-base-200/40 cursor-pointer *:text-nowrap">
                <th>
                    <input
                        aria-label="Single check"
                        type="checkbox"
                        data-slot="single-checkbox"
                        className="checkbox checkbox-sm"
                    />
                </th>
                <td className="font-medium">{id}</td>
                <td className="font-medium">{name}</td>
                <td>{sellerName}</td>
                <td>{email}</td>
                <td>{mobileNumber}</td>
                <td>{orders}</td>
                <td>
                    <div className="flex items-center gap-1">
                        <span
                            className={`iconify lucide--star text-success size-4 ${ratings > 4 ? "text-success" : ratings > 3 ? "text-warning" : "textarea-error"}`}
                        />
                        {ratings}
                        <span className="text-base-content/80 text-xs">({ratingsCount})</span>
                    </div>
                </td>
                <td>
                    <div className="text-sm font-medium">${earning}</div>
                </td>
                <td>
                    {verified ? (
                        <span className="iconify lucide--badge-check text-success size-4.5" />
                    ) : (
                        <span className="iconify lucide--badge-x text-error size-4.5" />
                    )}
                </td>
                <td className="text-sm">{date}</td>
                <td>
                    <div className="inline-flex w-fit">
                        <Link
                            aria-label="Edit customer link"
                            className="btn btn-square btn-ghost btn-sm"
                            to={`/apps/ecommerce/shops/${id}`}>
                            <span className="iconify lucide--pencil text-base-content/80 size-4" />
                        </Link>
                        <button aria-label="Dummy show shop" className="btn btn-square btn-ghost btn-sm">
                            <span className="iconify lucide--eye text-base-content/80 size-4" />
                        </button>
                        <button
                            aria-label="Dummy delete shop"
                            className="btn btn-square btn-error btn-outline btn-sm border-transparent"
                            onClick={() => document.querySelector<HTMLDialogElement>("#apps-shop-delete")?.showModal()}>
                            <span className="iconify lucide--trash size-4" />
                        </button>
                    </div>
                </td>
            </tr>
        </>
    );
};

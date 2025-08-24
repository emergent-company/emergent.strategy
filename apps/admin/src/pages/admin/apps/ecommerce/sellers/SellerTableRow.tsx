import { Link } from "react-router";

export type ISellerTableRow = {
    id: number;
    image: string;
    name: string;
    date: string;
    shopName: string;
    email: string;
    mobileNumber: string;
    verified: boolean;
    earning: number;
    sales: number;
    gender: "male" | "female";
};

export const SellerTableRow = ({
    id,
    name,
    date,
    image,
    shopName,
    email,
    sales,
    gender,
    earning,
    verified,
    mobileNumber,
}: ISellerTableRow) => {
    return (
        <tr className="hover:bg-base-200/40 cursor-pointer *:text-nowrap">
            <th>
                <input aria-label="Single check" className="checkbox checkbox-sm" type="checkbox" />
            </th>
            <td className="font-medium">{id}</td>
            <td>
                <div className="flex items-center space-x-3 truncate">
                    <img alt="Seller Image" className="mask mask-squircle bg-base-200 size-10" src={image} />
                    <div>
                        <p className="font-medium">{name}</p>
                        <p className="text-base-content/60 text-xs capitalize">{gender}</p>
                    </div>
                </div>
            </td>
            <td className="font-medium">{shopName}</td>
            <td>{email}</td>
            <td>{mobileNumber}</td>
            <td>{sales}</td>
            <td className="text-sm font-medium">${earning}</td>
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
                        aria-label="Edit seller link"
                        className="btn btn-square btn-ghost btn-sm"
                        to={`/apps/ecommerce/sellers/${id}`}>
                        <span className="iconify lucide--pencil text-base-content/80 size-4" />
                    </Link>
                    <button aria-label="Dummy show seller" className="btn btn-square btn-ghost btn-sm">
                        <span className="iconify lucide--eye text-base-content/80 size-4" />
                    </button>
                    <button
                        aria-label="Dummy delete seller"
                        className="btn btn-square btn-error btn-outline btn-sm border-transparent"
                        onClick={() => document.querySelector<HTMLDialogElement>("#apps-seller-delete")?.showModal()}>
                        <span className="iconify lucide--trash size-4" />
                    </button>
                </div>
            </td>
        </tr>
    );
};

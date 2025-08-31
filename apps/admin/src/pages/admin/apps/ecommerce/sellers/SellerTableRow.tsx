import { Link } from "react-router";
import { Icon } from "@/components/ui/Icon";

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
        <tr className="hover:bg-base-200/40 *:text-nowrap cursor-pointer">
            <th>
                <input aria-label="Single check" className="checkbox checkbox-sm" type="checkbox" />
            </th>
            <td className="font-medium">{id}</td>
            <td>
                <div className="flex items-center space-x-3 truncate">
                    <img alt="Seller Image" className="bg-base-200 size-10 mask mask-squircle" src={image} />
                    <div>
                        <p className="font-medium">{name}</p>
                        <p className="text-xs text-base-content/60 capitalize">{gender}</p>
                    </div>
                </div>
            </td>
            <td className="font-medium">{shopName}</td>
            <td>{email}</td>
            <td>{mobileNumber}</td>
            <td>{sales}</td>
            <td className="font-medium text-sm">${earning}</td>
            <td>
                {verified ? (
                    <Icon icon="lucide--badge-check" className="size-4.5 text-success" aria-hidden />
                ) : (
                    <Icon icon="lucide--badge-x" className="size-4.5 text-error" aria-hidden />
                )}
            </td>
            <td className="text-sm">{date}</td>
            <td>
                <div className="inline-flex w-fit">
                    <Link
                        aria-label="Edit seller link"
                        className="btn btn-square btn-ghost btn-sm"
                        to={`/apps/ecommerce/sellers/${id}`}>
                        <Icon icon="lucide--pencil" className="size-4 text-base-content/80" aria-hidden />
                    </Link>
                    <button aria-label="Dummy show seller" className="btn btn-square btn-ghost btn-sm">
                        <Icon icon="lucide--eye" className="size-4 text-base-content/80" aria-hidden />
                    </button>
                    <button
                        aria-label="Dummy delete seller"
                        className="border-transparent btn-outline btn btn-square btn-error btn-sm"
                        onClick={() => document.querySelector<HTMLDialogElement>("#apps-seller-delete")?.showModal()}>
                        <Icon icon="lucide--trash" className="size-4" aria-hidden />
                    </button>
                </div>
            </td>
        </tr>
    );
};

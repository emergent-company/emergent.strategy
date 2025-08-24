import { Link } from "react-router";

export type ICustomerTableRow = {
    id: number;
    image: string;
    name: string;
    date: string;
    email: string;
    mobileNumber: string;
    verified: boolean;
    spend: number;
    purchases: number;
    gender: "male" | "female";
};

export const CustomerTableRow = ({
    id,
    name,
    date,
    image,
    email,
    gender,
    purchases,
    spend,
    verified,
    mobileNumber,
}: ICustomerTableRow) => {
    return (
        <>
            <tr className="hover:bg-base-200/40 cursor-pointer *:text-nowrap">
                <th>
                    <input aria-label="Single check" type="checkbox" className="checkbox checkbox-sm" />
                </th>
                <td className="font-medium">{id}</td>
                <td>
                    <div className="flex items-center space-x-3 truncate">
                        <img alt="Product" className="mask mask-squircle bg-base-200 size-10" src={image} />
                        <div>
                            <p className="font-medium">{name}</p>
                            <p className="text-base-content/80 text-xs capitalize">{gender}</p>
                        </div>
                    </div>
                </td>
                <td>{email}</td>
                <td>{mobileNumber}</td>
                <td>{purchases}</td>
                <td className="text-sm font-medium">${spend}</td>
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
                            to={`/apps/ecommerce/customers/${id}`}>
                            <span className="iconify lucide--pencil text-base-content/80 size-4" />
                        </Link>
                        <button aria-label="Dummy show customer" className="btn btn-square btn-ghost btn-sm">
                            <span className="iconify lucide--eye text-base-content/80 size-4" />
                        </button>
                        <button
                            aria-label="Dummy delete customer"
                            className="btn btn-square btn-error btn-outline btn-sm border-transparent"
                            onClick={() =>
                                document.querySelector<HTMLDialogElement>("#apps-customer-delete")?.showModal()
                            }>
                            <span className="iconify lucide--trash size-4" />
                        </button>
                    </div>
                </td>
            </tr>
        </>
    );
};

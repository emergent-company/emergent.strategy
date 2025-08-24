import { Link } from "react-router";

export type IProductTableRow = {
    id: number;
    image: string;
    name: string;
    sku: string;
    category: string;
    price: number;
    ratings: number;
    ratingsCount: number;
    stock: number;
    createdAt: string;
    orders: number;
};

export const ProductTableRow = ({
    id,
    image,
    name,
    sku,
    category,
    price,
    ratings,
    ratingsCount,
    orders,
    stock,
    createdAt,
}: IProductTableRow) => {
    return (
        <tr className="hover:bg-base-200/40 cursor-pointer *:text-nowrap">
            <th>
                <input aria-label="Single check" type="checkbox" className="checkbox checkbox-sm" />
            </th>
            <td>{id}</td>
            <td>
                <div className="flex items-center space-x-3 truncate">
                    <img alt="Product" className="rounded-box size-10" src={image} />
                    <div>
                        <p className="font-medium">{name}</p>
                        <p className="text-base-content/60 text-xs">#{sku}</p>
                    </div>
                </div>
            </td>
            <td>{category}</td>
            <td className="text-sm font-medium">${price}</td>
            <td>
                <div className="flex items-center gap-2">
                    <span
                        className={`iconify lucide--star text-success size-4 ${ratings > 4 ? "text-success" : ratings > 3 ? "text-warning" : "textarea-error"}`}
                    />
                    {ratings}
                    <span className="text-base-content/60 text-xs">({ratingsCount})</span>
                </div>
            </td>
            <td>{orders}</td>
            <td>
                {stock > 10 ? (
                    <span className="text-success">Available</span>
                ) : stock > 0 ? (
                    <span className="text-warning">Low</span>
                ) : (
                    <span className="textarea-error">Out of stock</span>
                )}
            </td>
            <td className="text-sm">{createdAt}</td>
            <td>
                <div className="inline-flex">
                    <Link
                        aria-label="Edit product link"
                        className="btn btn-square btn-ghost btn-sm"
                        to={`/apps/ecommerce/products/${id}`}>
                        <span className="iconify lucide--pencil text-base-content/80 size-4" />
                    </Link>
                    <button aria-label="Dummy show product" className="btn btn-square btn-ghost btn-sm">
                        <span className="iconify lucide--eye text-base-content/80 size-4" />
                    </button>
                    <button
                        aria-label="Dummy delete product"
                        className="btn btn-square btn-error btn-outline btn-sm border-transparent"
                        onClick={() => document.querySelector<HTMLDialogElement>("#apps-product-delete")?.showModal()}>
                        <span className="iconify lucide--trash size-4" />
                    </button>
                </div>
            </td>
        </tr>
    );
};

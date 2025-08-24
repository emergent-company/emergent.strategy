export type IOrderItemsTableRow = {
    id: number;
    image: string;
    name: string;
    category: string;
    sku: string;
    price: number;
    quantity: number;
    totalAmount: number;
};

export const OrderItemsTableRow = ({
    id,
    image,
    name,
    category,
    price,
    quantity,
    sku,
    totalAmount,
}: IOrderItemsTableRow) => {
    return (
        <tr>
            <th className="font-medium">{id}</th>
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
            <td>${price}</td>
            <td>{quantity}x</td>
            <td className="font-medium">${totalAmount}</td>
        </tr>
    );
};

import { ReactNode } from "react";

export type IFileTableRow = {
    icon: string;
    name: string;
    size: string;
    date: string;
    owner: string;
    sharedWith: ReactNode;
};

export const FileTableRow = ({ icon, size, name, date, owner, sharedWith }: IFileTableRow) => {
    return (
        <tr className="hover:bg-base-200">
            <td>
                <input className="checkbox checkbox-sm" aria-label="Checkbox example" type="checkbox" />
            </td>
            <td className="flex items-center space-x-3 truncate">
                <div className="bg-base-200 text-base-content/80 rounded-box flex items-center p-1.5">
                    <span className={`iconify ${icon} size-5`} />
                </div>
                <div className="text-sm font-medium">{name}</div>
            </td>
            <td>{size}</td>
            <td>{date}</td>
            <td>{owner}</td>
            <td>{sharedWith}</td>
            <td>
                <button className="btn btn-ghost btn-square btn-sm" aria-label="Show file">
                    <span className="iconify lucide--eye text-base-content/80 size-4" />
                </button>
            </td>
        </tr>
    );
};

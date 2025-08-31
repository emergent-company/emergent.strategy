import { Icon } from "@/components/ui/Icon";
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
                <div className="flex items-center bg-base-200 p-1.5 rounded-box text-base-content/80">
                    <Icon icon={icon} className="size-5" />
                </div>
                <div className="font-medium text-sm">{name}</div>
            </td>
            <td>{size}</td>
            <td>{date}</td>
            <td>{owner}</td>
            <td>{sharedWith}</td>
            <td>
                <button className="btn btn-ghost btn-square btn-sm" aria-label="Show file">
                    <Icon icon="lucide--eye" className="size-4 text-base-content/80" />
                </button>
            </td>
        </tr>
    );
};

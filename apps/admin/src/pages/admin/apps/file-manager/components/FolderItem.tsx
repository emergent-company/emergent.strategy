import { FolderItemDropdown } from "./FolderItemDropdown";
import { Icon } from "@/components/ui/Icon";

export type IFolderItem = {
    icon: string;
    iconClass: string;
    name: string;
    filesCount: number;
};

export const FolderItem = ({ icon, iconClass, name, filesCount }: IFolderItem) => {
    return (
        <div className="bg-base-100 card-border card">
            <div className="p-3 card-body">
                <div className="flex items-center gap-2">
                    <div className={`rounded-box flex items-center p-1.5 ${iconClass}`}>
                        <Icon icon={icon} className="size-5" aria-hidden />
                    </div>
                    <span className="font-medium text-sm">{name}</span>
                    <div className="ms-auto">
                        <FolderItemDropdown />
                    </div>
                </div>
                <div className="flex items-center mt-2 text-xs text-base-content/70">{filesCount} Files</div>
            </div>
        </div>
    );
};

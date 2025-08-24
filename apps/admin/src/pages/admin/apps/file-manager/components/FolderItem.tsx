import { FolderItemDropdown } from "./FolderItemDropdown";

export type IFolderItem = {
    icon: string;
    iconClass: string;
    name: string;
    filesCount: number;
};

export const FolderItem = ({ icon, iconClass, name, filesCount }: IFolderItem) => {
    return (
        <div className="card card-border bg-base-100">
            <div className="card-body p-3">
                <div className="flex items-center gap-2">
                    <div className={`rounded-box flex items-center p-1.5 ${iconClass}`}>
                        <span className={`iconify ${icon} size-5`}></span>
                    </div>
                    <span className="text-sm font-medium">{name}</span>
                    <div className="ms-auto">
                        <FolderItemDropdown />
                    </div>
                </div>
                <div className="text-base-content/70 mt-2 flex items-center text-xs">{filesCount} Files</div>
            </div>
        </div>
    );
};

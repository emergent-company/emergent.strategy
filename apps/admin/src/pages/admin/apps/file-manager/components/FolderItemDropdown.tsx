import { Icon } from "@/components/ui/Icon";

export const FolderItemDropdown = () => {
    return (
        <div className="dropdown-bottom dropdown dropdown-center">
            <div tabIndex={0} role="button" className="btn btn-ghost btn-circle btn-sm" aria-label="Menu">
                <Icon icon="lucide--more-vertical" className="size-4" />
            </div>
            <div tabIndex={0} className="bg-base-100 shadow mt-2 rounded-box w-52 dropdown-content">
                <ul className="p-1.5 w-full menu">
                    <li>
                        <div>
                            <Icon icon="lucide--arrow-down-to-line" className="size-4" />
                            Download
                        </div>
                    </li>

                    <li>
                        <div>
                            <Icon icon="lucide--pen-line" className="size-4" />
                            Rename
                        </div>
                    </li>
                    <li>
                        <div>
                            <Icon icon="lucide--user-round-plus" className="size-4" />
                            Share
                        </div>
                    </li>
                </ul>
                <hr className="border-base-300" />
                <ul className="p-1.5 w-full menu">
                    <li>
                        <div className="hover:bg-error/10 text-error">
                            <Icon icon="lucide--trash" className="size-4" />
                            Move to bin
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    );
};

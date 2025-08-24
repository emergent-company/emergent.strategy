export const FolderItemDropdown = () => {
    return (
        <div className="dropdown dropdown-bottom dropdown-center">
            <div tabIndex={0} role="button" className="btn btn-ghost btn-circle btn-sm" aria-label="Menu">
                <span className="iconify lucide--more-vertical size-4" />
            </div>
            <div tabIndex={0} className="dropdown-content bg-base-100 rounded-box mt-2 w-52 shadow">
                <ul className="menu w-full p-1.5">
                    <li>
                        <div>
                            <span className="iconify lucide--arrow-down-to-line size-4" />
                            Download
                        </div>
                    </li>

                    <li>
                        <div>
                            <span className="iconify lucide--pen-line size-4" />
                            Rename
                        </div>
                    </li>
                    <li>
                        <div>
                            <span className="iconify lucide--user-round-plus size-4" />
                            Share
                        </div>
                    </li>
                </ul>
                <hr className="border-base-300" />
                <ul className="menu w-full p-1.5">
                    <li>
                        <div className="text-error hover:bg-error/10">
                            <span className="iconify lucide--trash size-4" />
                            Move to bin
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    );
};

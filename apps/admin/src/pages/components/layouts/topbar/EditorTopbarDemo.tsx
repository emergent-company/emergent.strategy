export const EditorTopbarDemo = () => {
    return (
        <div className="flex h-full w-full items-center justify-between gap-4 px-4">
            <div className="flex items-center gap-3">
                <label
                    className="btn btn-square btn-ghost btn-sm group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:hidden"
                    aria-label="Toggle sidebar"
                    htmlFor="layout-sidebar-toggle-trigger">
                    <span className="iconify lucide--menu size-5" />
                </label>
                <label
                    className="btn btn-square btn-ghost btn-sm hidden group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:flex"
                    aria-label="Leftmenu toggle"
                    htmlFor="layout-sidebar-hover-trigger">
                    <span className="iconify lucide--menu size-5" />
                </label>
                <div>
                    <p className="text-lg/none font-medium">Design Draft</p>
                    <div className="text-base-content/60 mt-0.5 flex items-center gap-1.5 max-sm:hidden">
                        <p className="text-sm">Projects</p>
                        <span className="iconify lucide--chevron-right size-3.5"></span>
                        <p className="text-base-content text-sm font-medium">Client</p>
                    </div>
                </div>
            </div>

            <div className="btn btn-outline border-base-300 btn-sm max-sm:btn-square w-56 gap-2 max-sm:ms-auto sm:justify-start">
                <span className="iconify lucide--search size-3.5"></span>
                <p className="text-base-content/60 text-sm font-normal max-sm:hidden">Search or jump to...</p>
            </div>

            <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 max-md:hidden">
                    <p className="text-base-content/60 text-sm">Saved just now</p>
                    <div className="avatar-group -space-x-3.5 *:border-2">
                        <div className="avatar bg-base-200 size-9 overflow-hidden rounded-full px-1 pt-1">
                            <img src="/images/avatars/1.png" alt="Avatar" />
                        </div>
                        <div className="avatar bg-base-200 size-9 overflow-hidden rounded-full px-1 pt-1">
                            <img src="/images/avatars/2.png" alt="Avatar" />
                        </div>
                        <div className="avatar bg-base-200 size-9 overflow-hidden rounded-full px-1 pt-1">
                            <img src="/images/avatars/3.png" alt="Avatar" />
                        </div>
                    </div>
                </div>
                <button className="btn btn-outline border-base-300 btn-sm">
                    <span className="iconify lucide--pen size-3"></span>
                    Edit
                </button>
            </div>
        </div>
    );
};

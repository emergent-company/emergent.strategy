export const ActionDropdown = () => {
    return (
        <div className="dropdown dropdown-bottom dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-ghost btn-circle btn-xs" aria-label="Menu">
                <span className="iconify lucide--more-vertical size-3.5" />
            </div>
            <div
                tabIndex={0}
                className="dropdown-content bg-base-100 rounded-box mt-2 w-40 shadow transition-all hover:shadow-lg">
                <ul className="menu w-full p-1.5">
                    <li>
                        <div>
                            <span className="iconify lucide--sparkles size-4" />
                            Enhance
                        </div>
                    </li>

                    <li>
                        <div>
                            <span className="iconify lucide--brain size-4" />
                            Insights
                        </div>
                    </li>

                    <li>
                        <div>
                            <span className="iconify lucide--wand-2 size-4" />
                            Auto Tag
                        </div>
                    </li>
                </ul>
                <hr className="border-base-300" />
                <ul className="menu w-full p-1.5">
                    <li>
                        <div className="text-error hover:bg-error/10">
                            <span className="iconify lucide--trash size-4" />
                            Delete
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    );
};

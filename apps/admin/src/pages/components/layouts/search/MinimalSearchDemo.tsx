import { useRef } from "react";

export const MinimalSearchDemo = () => {
    const dialogRef = useRef<HTMLDialogElement>(null);

    const showModal = () => {
        if (dialogRef.current) {
            dialogRef.current.showModal();
        }
    };

    return (
        <>
            <button onClick={showModal} role="button" className="btn btn-circle btn-soft" aria-label="Notifications">
                <span className="iconify lucide--search size-5" />
            </button>
            <dialog id="search-modal-demo-1" ref={dialogRef} className="modal p-0">
                <div className="modal-box p-0">
                    <div className="input border-base-300 w-full rounded-none border-0 border-b">
                        <span className="iconify lucide--search text-base-content/60 size-4.5" />
                        <input type="search" className="grow" placeholder="Search" aria-label="Search" />
                        <form method="dialog">
                            <button className="btn btn-xs btn-circle btn-ghost" aria-label="Close">
                                <span className="iconify lucide--x text-base-content/80 size-4" />
                            </button>
                        </form>
                    </div>
                    <ul className="menu w-full pt-0">
                        <li className="menu-title">Actions</li>
                        <li>
                            <div>
                                <span className="iconify lucide--folder-plus size-4.5" />
                                <p className="grow text-sm">Create a new folder</p>
                            </div>
                        </li>
                        <li>
                            <div>
                                <span className="iconify lucide--file-plus size-4.5" />
                                <p className="grow text-sm">Upload new document</p>
                            </div>
                        </li>
                        <li>
                            <div>
                                <span className="iconify lucide--user-plus size-4.5" />
                                <p className="grow text-sm">Invite to project</p>
                            </div>
                        </li>
                    </ul>
                    <hr className="border-base-300 h-px border-dashed" />
                    <ul className="menu w-full pt-0">
                        <li className="menu-title">Quick Links</li>
                        <li>
                            <div>
                                <span className="iconify lucide--folders size-4.5" />
                                <p className="grow text-sm">File Manager</p>
                            </div>
                        </li>

                        <li>
                            <div>
                                <span className="iconify lucide--user size-4.5" />
                                <p className="grow text-sm">Profile</p>
                            </div>
                        </li>
                        <li>
                            <div>
                                <span className="iconify lucide--layout-dashboard size-4.5" />
                                <p className="grow text-sm">Dashboard</p>
                            </div>
                        </li>

                        <li>
                            <div>
                                <span className="iconify lucide--help-circle size-4.5" />
                                <p className="grow text-sm">Support</p>
                            </div>
                        </li>

                        <li>
                            <div>
                                <span className="iconify lucide--keyboard size-4.5" />
                                <p className="grow text-sm">Keyboard Shortcuts</p>
                            </div>
                        </li>
                    </ul>
                </div>
                <form method="dialog" className="modal-backdrop">
                    <button>close</button>
                </form>
            </dialog>
        </>
    );
};

export const SwitchAccountMenuDemo = () => {
    return (
        <div className="dropdown dropdown-bottom sm:dropdown-end max-sm:dropdown-center">
            <div
                tabIndex={0}
                className="avatar bg-base-200 size-12 cursor-pointer overflow-hidden rounded-full px-1 pt-1">
                <img src="/images/avatars/2.png" alt="Avatar" />
            </div>

            <div tabIndex={0} className="dropdown-content bg-base-100 rounded-box mt-2 w-72 shadow">
                <div className="flex items-start gap-3 px-4 py-3">
                    <div className="avatar bg-base-200 size-10 cursor-pointer overflow-hidden rounded-full px-1 pt-1">
                        <img src="/images/avatars/2.png" alt="Avatar" />
                    </div>
                    <div>
                        <p className="font-medium">John Doe</p>
                        <p className="text-base-content/70 text-sm/none">john@email.com (Admin)</p>
                        <div className="mt-3 flex items-center gap-2">
                            <button className="btn btn-xs btn-outline border-base-300">
                                <span className="iconify lucide--settings-2 size-3.5"></span>
                                <span>Account</span>
                            </button>
                            <button className="btn btn-xs btn-outline border-base-300">
                                <span className="iconify lucide--log-out size-3.5"></span>
                                <span>Sign Out</span>
                            </button>
                        </div>
                    </div>
                </div>

                <hr className="border-base-200" />

                <div className="hover:bg-base-200/30 flex cursor-pointer items-center gap-3 px-4 py-2.5">
                    <div className="avatar bg-base-200 size-10 overflow-hidden rounded-full px-1 pt-1">
                        <img src="/images/avatars/3.png" alt="Avatar" />
                    </div>
                    <div>
                        <p className="font-medium">Jane Smith</p>
                        <p className="text-base-content/70 text-sm/none">jane@email.com (Editor)</p>
                    </div>
                </div>

                <div className="hover:bg-base-200/30 flex cursor-pointer items-center gap-3 px-4 py-2.5">
                    <div className="avatar bg-base-200 flex size-10 items-center justify-center rounded-full font-medium">
                        AB
                    </div>
                    <div>
                        <p className="font-medium">Alex Brown</p>
                        <div className="text-base-content/70 text-sm/none">alex@email.com (Viewer)</div>
                    </div>
                </div>

                <div className="hover:bg-base-200/30 flex cursor-pointer items-center gap-3 px-4 py-2.5">
                    <div className="avatar border-base-300 flex size-10 items-center justify-center rounded-full border border-dashed">
                        <span className="iconify lucide--user-plus size-5"></span>
                    </div>
                    <p className="font-medium">Add New Account</p>
                </div>

                <hr className="border-base-200" />

                <div className="hover:bg-base-200/30 flex cursor-pointer items-center gap-3 px-4 py-2.5">
                    <div className="flex w-10 items-center justify-center">
                        <span className="iconify lucide--log-out size-4.5"></span>
                    </div>
                    <p>Sign out from all accounts</p>
                </div>

                <p className="text-base-content/60 px-7 pt-1 pb-3 text-sm italic">
                    v3.0 - <span className="underline">Terms & Conditions</span>
                </p>
            </div>
        </div>
    );
};

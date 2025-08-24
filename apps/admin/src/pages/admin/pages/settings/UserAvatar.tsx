import React from "react";

import { FileUploader } from "@/components/forms/FileUploader";

export const UserAvatar = () => {
    return (
        <>
            <div
                className="avatar group relative size-24 min-w-24 cursor-pointer overflow-hidden rounded-full"
                onClick={() => document.querySelector<HTMLDialogElement>("#page-settings-avatar-modal")?.showModal()}>
                <div className="bg-base-200 p-1 pb-0">
                    <img src="/images/avatars/1.png" alt="Avatar" />
                </div>
                <div className="absolute right-0 -bottom-8 left-0 h-6 w-full bg-black/60 text-center text-sm font-medium text-white opacity-0 backdrop-blur-xs transition-all group-hover:bottom-0 group-hover:opacity-100">
                    Edit
                </div>
            </div>
            <dialog id="page-settings-avatar-modal" className="modal">
                <div className="modal-box">
                    <div className="flex items-center justify-between">
                        <p className="font-medium">Choose Avatar</p>
                        <form method="dialog">
                            <button className="btn btn-ghost btn-xs btn-circle" aria-label="Close upload file modal">
                                <span className="iconify lucide--x size-4" />
                            </button>
                        </form>
                    </div>
                    <div className="mt-4">
                        <FileUploader />
                        <div className="mt-5 text-end">
                            <button className="btn btn-primary btn-sm">
                                <span className="iconify lucide--arrow-up-from-line size-4" />
                                Update
                            </button>
                        </div>
                    </div>
                </div>
                <form method="dialog" className="modal-backdrop">
                    <button>close</button>
                </form>
            </dialog>
        </>
    );
};

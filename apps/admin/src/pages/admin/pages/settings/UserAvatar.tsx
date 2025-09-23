import React from "react";

import { FileUploader } from "@/components/molecules/FileUploader";
import { Icon } from "@/components/atoms/Icon";

export const UserAvatar = () => {
    return (
        <>
            <div
                className="group relative rounded-full min-w-24 size-24 overflow-hidden cursor-pointer avatar"
                onClick={() => document.querySelector<HTMLDialogElement>("#page-settings-avatar-modal")?.showModal()}>
                <div className="bg-base-200 p-1 pb-0">
                    <img src="/images/avatars/1.png" alt="Avatar" />
                </div>
                <div className="right-0 -bottom-8 group-hover:bottom-0 left-0 absolute bg-black/60 opacity-0 group-hover:opacity-100 backdrop-blur-xs w-full h-6 font-medium text-white text-sm text-center transition-all">
                    Edit
                </div>
            </div>
            <dialog id="page-settings-avatar-modal" className="modal">
                <div className="modal-box">
                    <div className="flex justify-between items-center">
                        <p className="font-medium">Choose Avatar</p>
                        <form method="dialog">
                            <button className="btn btn-ghost btn-xs btn-circle" aria-label="Close upload file modal">
                                <Icon icon="lucide--x" className="size-4" aria-hidden />
                            </button>
                        </form>
                    </div>
                    <div className="mt-4">
                        <FileUploader />
                        <div className="mt-5 text-end">
                            <button className="btn btn-primary btn-sm">
                                <Icon icon="lucide--arrow-up-from-line" className="size-4" aria-hidden />
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

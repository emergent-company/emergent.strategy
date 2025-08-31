import { FileUploader } from "@/components/forms/FileUploader";
import { Icon } from "@/components/ui/Icon";

export const UploadButton = () => {
    return (
        <>
            <button
                className="border-base-300 btn btn-ghost btn-sm"
                aria-label="Upload file"
                onClick={() => document.querySelector<HTMLDialogElement>("#apps-file-upload-modal")?.showModal()}>
                <Icon icon="lucide--upload" className="size-4" />
                Upload
            </button>
            <dialog id="apps-file-upload-modal" className="modal">
                <div className="modal-box">
                    <div className="flex justify-between items-center">
                        <p className="font-medium">Upload Files</p>
                        <form method="dialog">
                            <button className="btn btn-ghost btn-sm btn-circle" aria-label="Close upload file modal">
                                <Icon icon="lucide--x" className="size-5" />
                            </button>
                        </form>
                    </div>
                    <div className="mt-4">
                        <FileUploader />
                        <div className="mt-5 text-end">
                            <button className="btn btn-primary btn-sm">
                                <Icon icon="lucide--arrow-down-to-line" className="size-4" />
                                Import
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

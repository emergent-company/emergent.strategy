import { FileUploader } from "@/components/forms/FileUploader";

export const UploadButton = () => {
    return (
        <>
            <button
                className="btn btn-ghost border-base-300 btn-sm"
                aria-label="Upload file"
                onClick={() => document.querySelector<HTMLDialogElement>("#apps-file-upload-modal")?.showModal()}>
                <span className="iconify lucide--upload size-4" />
                Upload
            </button>
            <dialog id="apps-file-upload-modal" className="modal">
                <div className="modal-box">
                    <div className="flex items-center justify-between">
                        <p className="font-medium">Upload Files</p>
                        <form method="dialog">
                            <button className="btn btn-ghost btn-sm btn-circle" aria-label="Close upload file modal">
                                <span className="iconify lucide--x size-5" />
                            </button>
                        </form>
                    </div>
                    <div className="mt-4">
                        <FileUploader />
                        <div className="mt-5 text-end">
                            <button className="btn btn-primary btn-sm">
                                <span className="iconify lucide--arrow-down-to-line size-4" />
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

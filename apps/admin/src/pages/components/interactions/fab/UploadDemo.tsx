export const UploadDemo = () => {
    return (
        <div className="relative max-w-lg p-28">
            <div className="dropdown dropdown-top dropdown-end absolute end-0 bottom-0">
                <div
                    tabIndex={0}
                    role="button"
                    aria-label="FAB"
                    className="btn btn-primary btn-lg btn-circle shadow-primary/20 group shadow-md hover:shadow-lg">
                    <span className="iconify lucide--plus absolute size-6 scale-100 transition-all group-focus:rotate-45"></span>
                </div>
                <div tabIndex={0} className="dropdown-content mb-3 space-y-1 text-end">
                    <button className="btn gap-2 rounded-full">
                        <span className="iconify lucide--file-text size-4"></span>
                        Document
                    </button>
                    <button className="btn gap-2 rounded-full">
                        <span className="iconify lucide--image size-4"></span>
                        Image
                    </button>
                    <button className="btn gap-2 rounded-full">
                        <span className="iconify lucide--music size-4"></span>
                        Audio
                    </button>
                    <button className="btn gap-2 rounded-full">
                        <span className="iconify lucide--folder size-4"></span>
                        Folder
                    </button>
                </div>
            </div>
        </div>
    );
};

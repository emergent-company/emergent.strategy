export const SimpleDemo = () => {
    return (
        <div className="relative isolate max-w-lg p-28">
            <div className="dropdown dropdown-top dropdown-end absolute end-0 bottom-0 z-1">
                <div
                    tabIndex={0}
                    role="button"
                    aria-label="FAB"
                    className="btn btn-primary btn-lg btn-circle shadow-primary/20 group shadow-md hover:shadow-lg">
                    <span className="iconify lucide--menu absolute size-6 scale-100 transition-all duration-300 group-focus:scale-80 group-focus:rotate-90 group-focus:opacity-0"></span>
                    <span className="iconify lucide--x absolute size-6 scale-80 -rotate-90 opacity-0 transition-all duration-300 group-focus:scale-100 group-focus:rotate-0 group-focus:opacity-100"></span>
                </div>
                <div tabIndex={0} className="dropdown-content mb-3 space-y-2">
                    <div className="bg-error/5 border-error/50 hover:bg-error/10 text-error cursor-pointer rounded-full border p-2.5">
                        <span className="iconify lucide--trash-2 block size-4.5"></span>
                    </div>
                    <div className="bg-base-100 border-base-300 hover:bg-base-200 cursor-pointer rounded-full border p-2.5">
                        <span className="iconify lucide--edit-2 block size-4.5"></span>
                    </div>
                    <div className="bg-base-100 border-base-300 hover:bg-base-200 cursor-pointer rounded-full border p-2.5">
                        <span className="iconify lucide--plus block size-4.5"></span>
                    </div>
                </div>
            </div>
        </div>
    );
};

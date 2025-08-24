export const StepperTitleDemo = () => {
    return (
        <div className="">
            <div className="flex items-center justify-between">
                <p className="text-base-content grow font-medium sm:text-lg">Build Your Smart Course</p>

                <button className="btn btn-soft btn-sm max-sm:btn-square gap-2">
                    <span className="iconify lucide--eye size-4"></span>
                    <span className="max-sm:hidden">Preview</span>
                </button>
            </div>

            <div className="text-base-content/80 mt-2 flex items-center gap-3 text-sm">
                <div className="flex items-center gap-2">
                    <div className="bg-primary/20 text-primary flex size-6 items-center justify-center rounded-full font-semibold">
                        <span className="iconify lucide--check"></span>
                    </div>
                    <span className="font-medium max-lg:hidden">Course Details</span>
                </div>

                <span className="iconify lucide--chevron-right text-base-content/60"></span>

                <div className="flex items-center gap-2">
                    <div className="bg-primary text-primary-content flex size-6 items-center justify-center rounded-full font-medium">
                        2
                    </div>
                    <span className="text-primary font-medium max-sm:hidden">Content Setup</span>
                </div>

                <span className="iconify lucide--chevron-right text-base-content/60"></span>

                <div className="flex items-center gap-2">
                    <div className="border-base-300 text-base-content flex size-6 items-center justify-center rounded-full border border-dashed font-medium">
                        3
                    </div>
                    <span className="text-base-content/60 max-md:hidden">
                        Appearance <span className="ml-1 text-xs">(optional)</span>
                    </span>
                </div>

                <span className="iconify lucide--chevron-right text-base-content/60"></span>

                <div className="flex items-center gap-2">
                    <div className="bg-base-200 flex size-6 items-center justify-center rounded-full font-medium">
                        4
                    </div>
                    <span className="text-base-content/60 max-md:hidden">Launch Settings</span>
                </div>
            </div>
        </div>
    );
};

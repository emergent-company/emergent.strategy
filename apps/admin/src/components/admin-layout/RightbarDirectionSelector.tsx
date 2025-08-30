import { useConfig } from "@/contexts/config";

export const RightbarDirectionSelector: React.FC = () => {
    const { changeDirection } = useConfig();
    return (
        <div>
            <p className="mt-6 font-medium">Direction</p>
            <div className="gap-3 grid grid-cols-2 mt-3">
                <div
                    className="border-base-300 hover:bg-base-200 rounded-box group-[[dir=ltr]]/html:bg-base-200 group-[:not([dir])]/html:bg-base-200 inline-flex cursor-pointer items-center justify-center gap-2 border p-2"
                    onClick={() => changeDirection("ltr")}
                >
                    <span className="lucide--pilcrow-left size-4.5 iconify" />
                    <span className="hidden sm:inline">Left to Right</span>
                    <span className="sm:hidden inline">LTR</span>
                </div>
                <div
                    className="inline-flex justify-center items-center gap-2 hover:bg-base-200 group-[[dir=rtl]]/html:bg-base-200 p-2 border border-base-300 rounded-box cursor-pointer"
                    onClick={() => changeDirection("rtl")}
                >
                    <span className="lucide--pilcrow-right size-4.5 iconify" />
                    <span className="hidden sm:inline">Right to Right</span>
                    <span className="sm:hidden inline">RTL</span>
                </div>
            </div>
        </div>
    );
};

import { useConfig } from "@/contexts/config";
import { Icon } from "@/components/ui/Icon";
import { RightbarThemeSelector } from "./RightbarThemeSelector";
import { RightbarSidebarThemeSelector } from "./RightbarSidebarThemeSelector";
import { RightbarFontSelector } from "./RightbarFontSelector";
import { RightbarDirectionSelector } from "./RightbarDirectionSelector";

export const Rightbar = () => {
    const { toggleFullscreen, reset } = useConfig();

    return (
        <div className="drawer drawer-end">
            <input id="layout-rightbar-drawer" type="checkbox" className="drawer-toggle" />
            <div className="z-50 drawer-side">
                <label
                    htmlFor="layout-rightbar-drawer"
                    aria-label="close sidebar"
                    className="drawer-overlay"
                    aria-hidden
                />
                <div className="flex flex-col bg-base-100 w-76 sm:w-96 h-full text-base-content">
                    <div className="flex justify-between items-center bg-base-200/30 px-5 border-b border-base-200 h-16 min-h-16">
                        <p className="font-medium text-lg">Customization</p>
                        <div className="inline-flex gap-1">
                            <button
                                className="relative btn-ghost btn btn-sm btn-circle"
                                onClick={reset}
                                aria-label="Reset">
                                <Icon icon="lucide--rotate-cw" className="size-5" />
                                <span className="top-0.5 absolute bg-error opacity-0 group-data-[changed]/html:opacity-100 p-0 group-data-[changed]/html:p-[2px] rounded-full transition-all end-0.5"></span>
                            </button>
                            <button
                                className="btn btn-ghost btn-sm btn-circle"
                                onClick={toggleFullscreen}
                                aria-label="Full Screen">
                                <Icon icon="lucide--minimize" className="hidden group-data-[fullscreen]/html:inline size-5" />
                                <Icon icon="lucide--fullscreen" className="group-data-[fullscreen]/html:hidden inline size-5" />
                            </button>
                            <label
                                htmlFor="layout-rightbar-drawer"
                                aria-label="close sidebar"
                                aria-hidden
                                className="btn btn-ghost btn-sm btn-circle">
                                <Icon icon="lucide--x" className="size-5" />
                            </label>
                        </div>
                    </div>
                    <div className="p-4 sm:p-5 overflow-auto grow">
                        <RightbarThemeSelector />
                        <RightbarSidebarThemeSelector />
                        <RightbarFontSelector />
                        <RightbarDirectionSelector />
                    </div>
                </div>
            </div>
        </div>
    );
};

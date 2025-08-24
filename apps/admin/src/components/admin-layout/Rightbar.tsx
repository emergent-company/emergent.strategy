import { IConfig, useConfig } from "@/contexts/config";

const fontFamilies: { value: IConfig["fontFamily"]; label: string; className?: string }[] = [
    {
        value: "dm-sans",
        label: "DM Sans",
        className: "group-[[data-font-family=dm-sans]]/html:bg-base-200",
    },
    {
        value: "wix",
        label: "Wix",
        className: "group-[[data-font-family=wix]]/html:bg-base-200",
    },
    {
        value: "inclusive",
        label: "Inclusive",
        className:
            "group-[[data-font-family=inclusive]]/html:bg-base-200 group-[:not([data-font-family])]/html:bg-base-200",
    },
    {
        value: "ar-one",
        label: "AR One",
        className: "group-[[data-font-family=ar-one]]/html:bg-base-200",
    },
];

export const Rightbar = () => {
    const { toggleFullscreen, changeSidebarTheme, changeFontFamily, changeDirection, changeTheme, reset } = useConfig();

    return (
        <div className="drawer drawer-end">
            <input id="layout-rightbar-drawer" type="checkbox" className="drawer-toggle" />
            <div className="drawer-side z-50">
                <label
                    htmlFor="layout-rightbar-drawer"
                    aria-label="close sidebar"
                    className="drawer-overlay"
                    aria-hidden
                />
                <div className="bg-base-100 text-base-content flex h-full w-76 flex-col sm:w-96">
                    <div className="bg-base-200/30 border-base-200 flex h-16 min-h-16 items-center justify-between border-b px-5">
                        <p className="text-lg font-medium">Customization</p>
                        <div className="inline-flex gap-1">
                            <button
                                className="btn-ghost btn btn-sm btn-circle relative"
                                onClick={reset}
                                aria-label="Reset">
                                <span className="iconify lucide--rotate-cw size-5" />
                                <span className="bg-error absolute end-0.5 top-0.5 rounded-full p-0 opacity-0 transition-all group-data-[changed]/html:p-[2px] group-data-[changed]/html:opacity-100"></span>
                            </button>
                            <button
                                className="btn btn-ghost btn-sm btn-circle"
                                onClick={toggleFullscreen}
                                aria-label="Full Screen">
                                <span className="iconify lucide--minimize hidden size-5 group-data-[fullscreen]/html:inline" />
                                <span className="iconify lucide--fullscreen inline size-5 group-data-[fullscreen]/html:hidden" />
                            </button>
                            <label
                                htmlFor="layout-rightbar-drawer"
                                aria-label="close sidebar"
                                aria-hidden
                                className="btn btn-ghost btn-sm btn-circle">
                                <span className="iconify lucide--x size-5" />
                            </label>
                        </div>
                    </div>
                    <div className="grow overflow-auto p-4 sm:p-5">
                        <p className="font-medium">Theme</p>
                        <div className="mt-3 grid grid-cols-3 gap-3">
                            <div
                                data-theme="light"
                                className="rounded-box group relative cursor-pointer"
                                onClick={() => changeTheme("light")}>
                                <div className="bg-base-200 rounded-box pt-5 pb-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <span className="rounded-box bg-primary h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-secondary h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-accent h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-success h-6 w-2 sm:w-3"></span>
                                    </div>
                                    <p className="mt-1.5 text-sm capitalize sm:text-base">Light</p>
                                </div>
                                <span className="bg-primary text-primary-content absolute end-2 top-2 rounded-full p-0 opacity-0 transition-all group-data-[theme=light]/html:p-1 group-data-[theme=light]/html:opacity-100" />
                            </div>
                            <div
                                data-theme="contrast"
                                className="rounded-box group relative cursor-pointer"
                                onClick={() => changeTheme("contrast")}>
                                <div className="bg-base-200 rounded-box pt-5 pb-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <span className="rounded-box bg-primary h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-secondary h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-accent h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-success h-6 w-2 sm:w-3"></span>
                                    </div>
                                    <p className="mt-1.5 text-sm capitalize sm:text-base">Contrast</p>
                                </div>
                                <span className="bg-primary text-primary-content absolute end-2 top-2 rounded-full p-0 opacity-0 transition-all group-data-[theme=contrast]/html:p-1 group-data-[theme=contrast]/html:opacity-100" />
                            </div>
                            <div
                                data-theme="material"
                                className="rounded-box group relative cursor-pointer"
                                onClick={() => changeTheme("material")}>
                                <div className="bg-base-200 rounded-box pt-5 pb-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <span className="rounded-box bg-primary h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-secondary h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-accent h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-success h-6 w-2 sm:w-3"></span>
                                    </div>
                                    <p className="mt-1.5 text-sm capitalize sm:text-base">Material</p>
                                </div>
                                <span className="bg-primary text-primary-content absolute end-2 top-2 rounded-full p-0 opacity-0 transition-all group-data-[theme=material]/html:p-1 group-data-[theme=material]/html:opacity-100" />
                            </div>

                            <div
                                data-theme="dark"
                                className="rounded-box group relative cursor-pointer"
                                onClick={() => changeTheme("dark")}>
                                <div className="bg-base-200 rounded-box pt-5 pb-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <span className="rounded-box bg-primary h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-secondary h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-accent h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-success h-6 w-2 sm:w-3"></span>
                                    </div>
                                    <p className="mt-1.5 text-sm capitalize sm:text-base">Dark</p>
                                </div>
                                <span className="bg-primary text-primary-content absolute end-2 top-2 rounded-full p-0 opacity-0 transition-all group-data-[theme=dark]/html:p-1 group-data-[theme=dark]/html:opacity-100" />
                            </div>

                            <div
                                data-theme="dim"
                                className="rounded-box group relative cursor-pointer"
                                onClick={() => changeTheme("dim")}>
                                <div className="bg-base-200 rounded-box pt-5 pb-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <span className="rounded-box bg-primary h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-secondary h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-accent h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-success h-6 w-2 sm:w-3"></span>
                                    </div>
                                    <p className="mt-1.5 text-sm capitalize sm:text-base">Dim</p>
                                </div>
                                <span className="bg-primary text-primary-content absolute end-2 top-2 rounded-full p-0 opacity-0 transition-all group-data-[theme=dim]/html:p-1 group-data-[theme=dim]/html:opacity-100" />
                            </div>

                            <div
                                data-theme="material-dark"
                                className="rounded-box group relative cursor-pointer"
                                onClick={() => changeTheme("material-dark")}>
                                <div className="bg-base-200 rounded-box pt-5 pb-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <span className="rounded-box bg-primary h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-secondary h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-accent h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-success h-6 w-2 sm:w-3"></span>
                                    </div>
                                    <p className="mt-2.5 text-xs capitalize sm:text-sm">Material Dark</p>
                                </div>
                                <span className="bg-primary text-primary-content absolute end-2 top-2 rounded-full p-0 opacity-0 transition-all group-data-[theme=material-dark]/html:p-1 group-data-[theme=material-dark]/html:opacity-100" />
                            </div>

                            <div
                                className="rounded-box group relative cursor-pointer"
                                onClick={() => changeTheme("system")}>
                                <div className="bg-base-200 rounded-box pt-5 pb-3 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <span className="rounded-box bg-primary h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-secondary h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-accent h-6 w-2 sm:w-3"></span>
                                        <span className="rounded-box bg-success h-6 w-2 sm:w-3"></span>
                                    </div>
                                    <p className="mt-1.5 text-sm capitalize sm:text-base">System</p>
                                </div>
                                <span className="bg-primary text-primary-content absolute end-2 top-2 rounded-full p-0 opacity-0 transition-all group-[:not([data-theme])]/html:p-1 group-[:not([data-theme])]/html:opacity-100" />
                            </div>
                        </div>
                        <div className="pointer-events-none opacity-50 group-data-[theme=contrast]/html:pointer-events-auto group-data-[theme=contrast]/html:opacity-100 group-data-[theme=light]/html:pointer-events-auto group-data-[theme=light]/html:opacity-100">
                            <p className="mt-6 font-medium">
                                Sidebar
                                <span className="ms-1 inline text-xs group-data-[theme=contrast]/html:hidden group-data-[theme=light]/html:hidden md:text-sm">
                                    (*Only available in light, contrast themes)
                                </span>
                            </p>
                            <div className="mt-3 grid grid-cols-2 gap-3">
                                <div
                                    className="border-base-300 hover:bg-base-200 rounded-box group-data-[sidebar-theme=light]/html:bg-base-200 inline-flex cursor-pointer items-center justify-center gap-2 border p-2"
                                    onClick={() => changeSidebarTheme("light")}>
                                    <span className="iconify lucide--sun size-4.5" />
                                    Light
                                </div>
                                <div
                                    className="border-base-300 hover:bg-base-200 rounded-box group-data-[sidebar-theme=dark]/html:bg-base-200 inline-flex cursor-pointer items-center justify-center gap-2 border p-2"
                                    onClick={() => changeSidebarTheme("dark")}>
                                    <span className="iconify lucide--moon size-4.5" />
                                    Dark
                                </div>
                            </div>
                        </div>
                        <p className="mt-6 font-medium">Font Family</p>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                            {fontFamilies.map((item, index) => (
                                <div
                                    key={index}
                                    className={
                                        "border-base-300 hover:bg-base-200 rounded-box inline-flex cursor-pointer items-center justify-center gap-2 border p-2 " +
                                        item.className
                                    }
                                    onClick={() => changeFontFamily(item.value)}>
                                    <p data-font-family={item.value} className="font-sans">
                                        {item.label}
                                    </p>
                                </div>
                            ))}
                        </div>
                        <p className="mt-6 font-medium">Direction</p>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                            <div
                                className="border-base-300 hover:bg-base-200 rounded-box group-[[dir=ltr]]/html:bg-base-200 group-[:not([dir])]/html:bg-base-200 inline-flex cursor-pointer items-center justify-center gap-2 border p-2"
                                onClick={() => changeDirection("ltr")}>
                                <span className="iconify lucide--pilcrow-left size-4.5" />
                                <span className="hidden sm:inline">Left to Right</span>
                                <span className="inline sm:hidden">LTR</span>
                            </div>
                            <div
                                className="border-base-300 hover:bg-base-200 rounded-box group-[[dir=rtl]]/html:bg-base-200 inline-flex cursor-pointer items-center justify-center gap-2 border p-2"
                                onClick={() => changeDirection("rtl")}>
                                <span className="iconify lucide--pilcrow-right size-4.5" />
                                <span className="hidden sm:inline">Right to Right</span>
                                <span className="inline sm:hidden">RTL</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

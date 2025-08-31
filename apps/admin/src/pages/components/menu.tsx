import { ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";

import { ISidebarMenuItem } from "@/components/admin-layout/SidebarMenuItem";

type ISubMenuItem = ISidebarMenuItem & { preview?: ReactNode };

type IComponentMenuItem = Omit<ISidebarMenuItem, "children"> & {
    children?: ISubMenuItem[];
};

export const componentsMenuItems: IComponentMenuItem[] = [
    {
        id: "base-label",
        isTitle: true,
        label: "Base",
    },
    {
        id: "foundations",
        icon: "lucide--shapes",
        label: "Foundations",
        children: [
            {
                id: "foundations-text",
                label: "Text",
                url: "/components/foundations/text",
                preview: (
                    <div className="space-y-1">
                        <div className="bg-base-content/15 rounded-xs w-5 h-1"></div>
                        <div className="bg-base-content/20 rounded-xs w-10 h-2"></div>
                        <div className="bg-base-content/30 rounded-xs w-15 h-2.5"></div>
                        <div className="bg-base-content/30 rounded-xs w-20 h-3"></div>
                    </div>
                ),
            },
            {
                id: "foundations-display",
                label: "Display",
                url: "/components/foundations/display",
                preview: (
                    <div className="gap-2 grid grid-cols-3">
                        {Array.from({ length: 9 }).map((_, i) => (
                            <div key={i} className="bg-base-content/20 rounded-xs size-6"></div>
                        ))}
                    </div>
                ),
            },
            {
                id: "foundations-effects",
                label: "Effects",
                url: "/components/foundations/effects",
                preview: (
                    <div className="gap-2 grid grid-cols-2">
                        <div className="bg-base-content/15 rounded-xs size-8"></div>
                        <div className="bg-base-content/15 blur-sm rounded-xs size-8"></div>
                        <div className="bg-primary brightness-125 rounded-xs size-8"></div>
                        <div className="bg-secondary rounded-xs size-8 contrast-125"></div>
                    </div>
                ),
            },
            {
                id: "foundations-shadows",
                label: "Shadows",
                url: "/components/foundations/shadows",
                preview: (
                    <div className="gap-2 grid grid-cols-2">
                        <div className="bg-base-content/20 shadow-xs rounded-xs size-8"></div>
                        <div className="bg-base-content/20 shadow-sm rounded-xs size-8"></div>
                        <div className="bg-base-content/20 shadow-lg rounded-xs size-8"></div>
                        <div className="bg-base-content/20 shadow-xl rounded-xs size-8"></div>
                    </div>
                ),
            },
        ],
    },
    {
        id: "blocks",
        icon: "lucide--blocks",
        label: "Blocks",
        children: [
            {
                id: "blocks-stats",
                label: "Dashboard Stats",
                url: "/components/blocks/stats",
                preview: (
                    <div className="gap-2 grid grid-cols-2">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div
                                key={i}
                                className="flex justify-between items-start gap-1 bg-base-content/10 px-2 py-2 rounded-xs">
                                <div className="bg-base-content/15 rounded-xs size-3"></div>
                                <div className="space-y-0.5">
                                    <div className="bg-base-content/30 rounded-xs w-6 h-1.5"></div>
                                    <div className="bg-base-content/25 rounded-xs w-3 h-1.5"></div>
                                </div>
                                <div className="bg-base-content/20 size-1"></div>
                            </div>
                        ))}
                    </div>
                ),
            },
            {
                id: "blocks-prompt-bar",
                label: "Prompt Bar",
                url: "/components/blocks/prompt-bar",
                preview: (
                    <div className="border border-base-300 rounded-xs w-3/5">
                        <div className="p-1 h-12">
                            <p className="text-xs text-base-content/50">Type your request</p>
                        </div>
                        <div className="flex items-center gap-1 bg-base-content/10 px-2 py-1.5">
                            <div className="bg-base-content/20 rounded-xs w-3 h-2"></div>
                            <div className="bg-base-content/20 rounded-xs w-4 h-2"></div>
                            <div className="bg-base-content/20 ms-auto rounded-xs w-5 h-1.5"></div>
                            <div className="bg-base-content/25 ms-auto rounded-xs size-2"></div>
                            <div className="bg-base-content/30 rounded-xs size-2"></div>
                        </div>
                    </div>
                ),
            },
        ],
    },
    {
        id: "layouts",
        icon: "lucide--layout-panel-left",
        label: "Layouts",
        children: [
            {
                id: "layouts-skeleton",
                label: "Skeleton",
                url: "/components/layouts/skeleton",
                preview: (
                    <div className="space-y-2.5 w-3/4 sm:w-3/5">
                        <div className="gap-2 grid grid-cols-4">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="border border-base-content/30 border-dashed rounded-xs h-4"></div>
                            ))}
                        </div>
                        <div className="gap-2 grid grid-cols-5">
                            <div className="col-span-3 bg-base-content/10 border border-base-content/30 border-dashed rounded-xs h-10"></div>
                            <div className="col-span-2 border border-base-content/30 border-dashed rounded-xs h-10"></div>
                        </div>
                        <div className="gap-2 grid grid-cols-3">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="border border-base-content/30 border-dashed rounded-xs h-6"></div>
                            ))}
                        </div>
                    </div>
                ),
            },
            {
                id: "layouts-sidebar",
                label: "Sidebar",
                url: "/components/layouts/sidebar",
                preview: (
                    <div className="flex border border-base-300 rounded-xs w-3/4 sm:w-3/5 h-24">
                        <div className="bg-base-content/20 rounded-s-xs w-8"></div>
                        <div className="flex flex-col grow">
                            <div className="border-b border-base-300 border-dashed h-4"></div>
                            <div className="flex justify-center items-center text-xs text-base-content/50 grow">
                                Content
                            </div>
                            <div className="border-t border-base-300 border-dashed h-2"></div>
                        </div>
                    </div>
                ),
            },
            {
                id: "layouts-topbar",
                label: "Topbar",
                url: "/components/layouts/topbar",
                preview: (
                    <div className="flex border border-base-300 rounded-xs w-3/4 sm:w-3/5 h-24">
                        <div className="border-e border-base-300 border-dashed w-8"></div>
                        <div className="flex flex-col grow">
                            <div className="bg-base-content/20 h-4"></div>
                            <div className="flex justify-center items-center text-xs text-base-content/50 grow">
                                Content
                            </div>
                            <div className="border-t border-base-300 border-dashed h-2"></div>
                        </div>
                    </div>
                ),
            },
            {
                id: "layouts-footer",
                label: "Footer",
                url: "/components/layouts/footer",
                preview: (
                    <div className="flex border border-base-300 rounded-xs w-3/4 sm:w-3/5 h-24">
                        <div className="border-e border-base-300 border-dashed w-8"></div>
                        <div className="flex flex-col grow">
                            <div className="border-b border-base-300 border-dashed h-4"></div>
                            <div className="flex justify-center items-center text-xs text-base-content/50 grow">
                                Content
                            </div>
                            <div className="bg-base-content/20 h-2"></div>
                        </div>
                    </div>
                ),
            },
            {
                id: "layouts-profile-menu",
                label: "Profile Menu",
                url: "/components/layouts/profile-menu",
                preview: (
                    <div className="space-y-1.5 w-1/2 sm:w-1/3">
                        <div className="flex justify-end items-center">
                            <div className="bg-base-content/20 rounded-full size-5"></div>
                        </div>
                        <div className="space-y-1 p-2 border border-base-300 rounded-xs w-full">
                            <div className="flex items-center gap-1.5">
                                <div className="bg-base-content/25 rounded-full size-5"></div>
                                <div className="space-y-0.5">
                                    <div className="bg-base-content/25 rounded-xs w-8 h-2"></div>
                                    <div className="bg-base-content/15 rounded-xs w-4 h-1.5"></div>
                                </div>
                            </div>

                            <div className="mt-2 p-0.5 border border-base-300 rounded-xs">
                                <div className="bg-base-content/20 rounded-xs w-6 h-1.5"></div>
                            </div>
                            <div className="p-0.5 border border-base-300 rounded-xs">
                                <div className="bg-base-content/20 rounded-xs w-8 h-1.5"></div>
                            </div>
                        </div>
                    </div>
                ),
            },
            {
                id: "layouts-search",
                label: "Search",
                url: "/components/layouts/search",
                preview: (
                    <div className="space-y-1 w-1/2 sm:w-1/3">
                        <div className="px-1 py-0.5 border border-base-300 rounded-xs text-xs text-base-content/50">
                            Search...
                        </div>
                        <div className="space-y-1 p-1.5 border border-base-300 rounded-xs w-full">
                            <div className="p-1 border border-base-300 border-dashed rounded-xs">
                                <div className="bg-base-content/20 rounded-xs w-6 h-1 skeleton"></div>
                            </div>
                            <div className="p-1 border border-base-300 border-dashed rounded-xs">
                                <div className="bg-base-content/20 rounded-xs w-8 h-1 skeleton"></div>
                            </div>
                            <div className="p-1 border border-base-300 border-dashed rounded-xs">
                                <div className="bg-base-content/20 rounded-xs w-4 h-1 skeleton"></div>
                            </div>
                        </div>
                    </div>
                ),
            },
            {
                id: "layouts-notification",
                label: "Notification",
                url: "/components/layouts/notification",
                preview: (
                    <div className="space-y-1 w-1/2 sm:w-1/3">
                        <div className="flex justify-end items-center">
                            <div className="bg-base-content/20 rounded-full size-5"></div>
                        </div>
                        <div className="space-y-1 p-1.5 border border-base-300 rounded-xs w-full">
                            <div className="p-1 border border-base-300 rounded-xs">
                                <div className="bg-base-content/25 rounded-xs w-5 h-1"></div>
                            </div>
                            <div className="p-1 border border-base-300 rounded-xs">
                                <div className="bg-base-content/25 rounded-xs w-6 h-1"></div>
                            </div>
                            <div className="p-1 border border-base-300 rounded-xs">
                                <div className="bg-base-content/20 rounded-xs w-8 h-1"></div>
                            </div>
                        </div>
                    </div>
                ),
            },
            {
                id: "layouts-page-title",
                label: "Page Title",
                url: "/components/layouts/page-title",
                preview: (
                    <div className="flex items-center gap-2 w-3/4 sm:w-3/5">
                        <div className="space-y-1">
                            <div className="bg-base-content/30 rounded-xs w-10 h-3"></div>
                            <div className="bg-base-content/25 rounded-xs w-5 h-1.5"></div>
                        </div>
                        <div className="flex flex-col items-end gap-1 ms-auto">
                            <div className="flex gap-1">
                                <div className="max-sm:hidden border border-base-300 rounded-xs size-4"></div>
                                <div className="bg-base-content/25 rounded-xs size-4"></div>
                                <div className="bg-base-content/30 rounded-xs w-8 h-4"></div>
                            </div>
                            <div className="bg-base-content/15 w-12 h-0.5"></div>
                        </div>
                    </div>
                ),
            },
        ],
    },
    {
        id: "advanced-label",
        isTitle: true,
        label: "Dynamics",
    },
    {
        id: "interactions",
        icon: "lucide--layers-3",
        label: "Interactions",
        children: [
            {
                id: "interactions-carousel",
                label: "Carousel",
                url: "/components/interactions/carousel",
                preview: (
                    <div className="space-y-2.5">
                        <div className="flex justify-between items-center gap-1.5">
                            <div className="bg-linear-to-r from-transparent to-[80%] to-base-content/15 rounded-xs w-8 h-10"></div>
                            <div className="bg-base-content/25 rounded-xs w-12 h-10"></div>
                            <div className="max-sm:hidden bg-base-content/25 rounded-xs w-12 h-10"></div>
                            <div className="bg-linear-to-l from-transparent to-[80%] to-base-content/15 rounded-xs w-8 h-10"></div>
                        </div>
                        <div className="flex justify-between gap-2">
                            <div className="flex justify-center items-center bg-base-content/10 p-1 rounded-full text-base-content/80">
                                <Icon icon="lucide--chevron-left" className="size-3" />
                            </div>
                            <div className="flex items-center gap-[3px]">
                                <div className="bg-base-content/15 rounded-full size-1.5"></div>
                                <div className="bg-base-content/15 rounded-full size-1.5"></div>
                                <div className="bg-base-content/30 rounded-full size-1.5"></div>
                                <div className="bg-base-content/15 rounded-full size-1.5"></div>
                                <div className="bg-base-content/15 rounded-full size-1.5"></div>
                            </div>
                            <div className="flex justify-center items-center bg-base-content/10 p-1 rounded-full text-base-content/80">
                                <Icon icon="lucide--chevron-right" className="size-3" />
                            </div>
                        </div>
                    </div>
                ),
            },
            {
                id: "interactions-clipboard",
                label: "Clipboard",
                url: "/components/interactions/clipboard",
                preview: (
                    <div className="space-y-1.5 bg-base-content/3 p-2 border border-base-300 rounded-xs w-3/4 sm:w-3/5 text-xs text-base-content/70">
                        <p>Write and copy instantly</p>
                        <div className="flex justify-end items-center gap-1.5 mt-3">
                            <Icon icon="lucide--copy" className="size-3.5" />
                        </div>
                    </div>
                ),
            },
            {
                id: "interactions-datatables",
                label: "Data Tables",
                url: "/components/interactions/datatables",
                preview: (
                    <div className="w-3/4 sm:w-1/2">
                        <div className="flex items-center gap-1">
                            <div className="bg-base-content/25 rounded-xs w-8 h-2"></div>
                            <div className="bg-base-content/20 ms-auto rounded-xs size-2"></div>
                            <div className="bg-base-content/20 rounded-xs size-2"></div>
                        </div>
                        <div className="mt-1.5 border border-base-300 rounded-xs divide-y divide-base-200">
                            <div className="gap-1 grid grid-cols-3 p-1">
                                <div className="bg-base-content/25 rounded-xs w-4 h-1.5"></div>
                                <div className="bg-base-content/25 rounded-xs w-6 h-1.5"></div>
                                <div className="bg-base-content/25 rounded-xs w-6 h-1.5"></div>
                            </div>
                            <div className="gap-1 grid grid-cols-3 p-1">
                                <div className="bg-base-content/15 rounded-xs w-4 h-1.5"></div>
                                <div className="bg-base-content/15 rounded-xs w-6 h-1.5"></div>
                                <div className="bg-base-content/15 rounded-xs w-8 h-1.5"></div>
                            </div>
                            <div className="gap-1 grid grid-cols-3 p-1">
                                <div className="bg-base-content/15 rounded-xs w-4 h-1.5"></div>
                                <div className="bg-base-content/15 rounded-xs w-7 h-1.5"></div>
                                <div className="bg-base-content/15 rounded-xs w-3 h-1.5"></div>
                            </div>
                            <div className="gap-1 grid grid-cols-3 p-1">
                                <div className="bg-base-content/15 rounded-xs w-4 h-1.5"></div>
                                <div className="bg-base-content/15 rounded-xs w-5 h-1.5"></div>
                                <div className="bg-base-content/15 rounded-xs w-8 h-1.5"></div>
                            </div>
                        </div>
                        <div className="flex items-center gap-0.5 mt-1.5">
                            <div className="bg-base-content/15 rounded-xs w-5 h-1.5"></div>
                            <div className="bg-base-content/25 ms-auto rounded-xs size-1.5"></div>
                            <div className="bg-base-content/15 rounded-xs size-1.5"></div>
                            <div className="bg-base-content/15 rounded-xs size-1.5"></div>
                            <div className="bg-base-content/15 rounded-xs size-1.5"></div>
                            <div className="bg-base-content/25 rounded-xs size-1.5"></div>
                        </div>
                    </div>
                ),
            },
            {
                id: "interactions-fab",
                label: "FAB",
                url: "/components/interactions/fab",
                preview: (
                    <div className="flex flex-col justify-end items-end space-y-1.5">
                        <div className="flex items-end gap-1">
                            <div className="bg-base-content/25 rounded-full size-2"></div>
                            <div className="bg-base-content/15 rounded-xs w-12 h-2"></div>
                        </div>
                        <div className="flex items-end gap-1">
                            <div className="bg-base-content/25 rounded-full size-2"></div>
                            <div className="bg-base-content/15 rounded-xs w-16 h-2"></div>
                        </div>
                        <div className="flex items-end gap-1">
                            <div className="bg-base-content/25 rounded-full size-2"></div>
                            <div className="bg-base-content/15 rounded-xs w-10 h-2"></div>
                        </div>
                        <div className="bg-base-content/25 shadow-lg rounded-full size-6"></div>
                    </div>
                ),
            },
            {
                id: "interactions-file-upload",
                label: "File Upload",
                url: "/components/interactions/file-upload",
                preview: (
                    <div className="border border-base-300 border-dashed rounded-xs w-3/4 sm:w-3/5">
                        <div className="flex flex-col justify-center items-center gap-1 pt-5 pb-3 text-xs text-base-content/70">
                            <Icon icon="lucide--upload" />
                            Add Files
                        </div>
                        <div className="flex items-center gap-1.5 bg-base-content/10 m-1.5 p-1.5 rounded-xs">
                            <div className="bg-base-content/25 rounded-full size-3"></div>
                            <div className="space-y-0.5">
                                <div className="bg-base-content/30 rounded-xs w-8 h-1.5"></div>
                                <div className="bg-base-content/20 rounded-xs w-4 h-1"></div>
                            </div>
                            <Icon icon="lucide--x" className="ms-auto size-2.5 text-base-content/50" />
                        </div>
                    </div>
                ),
            },
            {
                id: "interactions-flatpickr",
                label: "Flatpickr",
                url: "/components/interactions/flatpickr",
                preview: (
                    <div>
                        <div className="px-1.5 py-0.5 border border-base-300 rounded-xs text-[9px] text-base-content/70">
                            DD/MM/YY
                        </div>
                        <div className="mt-1.5 p-1.5 border border-base-300 rounded-xs">
                            <div className="flex justify-between items-center">
                                <div className="bg-base-content/20 rounded-xs size-2"></div>
                                <div className="bg-base-content/25 rounded-xs w-8 h-2"></div>
                                <div className="bg-base-content/20 rounded-xs size-2"></div>
                            </div>
                            <div className="gap-1 grid grid-cols-7 mt-2">
                                <div></div>
                                <div></div>
                                {Array.from({ length: 14 }).map((_, i) => (
                                    <div key={i} className="bg-base-content/15 rounded-xs size-2"></div>
                                ))}
                                <div className="bg-base-content/60 rounded-xs size-2"></div>
                                {Array.from({ length: 15 }).map((_, i) => (
                                    <div key={i} className="bg-base-content/15 rounded-xs size-2"></div>
                                ))}
                            </div>
                        </div>
                    </div>
                ),
            },
            {
                id: "interactions-form-validations",
                label: "Form Validations",
                url: "/components/interactions/form-validations",
                preview: (
                    <div className="w-3/4 sm:w-1/2">
                        <div className="flex justify-between items-center gap-1">
                            <div className="bg-base-content/15 rounded-xs w-6 h-1.5"></div>
                            <div className="bg-base-content/15 rounded-xs w-6 h-1.5"></div>
                        </div>
                        <div className="flex justify-between items-center gap-1 mt-1 px-1.5 py-0.5 border border-base-300 rounded-xs text-xs text-base-content/70">
                            <div className="bg-base-content/10 rounded-xs w-6 h-1.5"></div>
                            <Icon icon="lucide--circle-alert" className="size-3 text-base-content/50" />
                        </div>
                        <div className="bg-base-content/15 mt-1 rounded-xs w-12 h-1.5"></div>
                    </div>
                ),
            },
            {
                id: "interactions-input-spinner",
                label: "Input Spinner",
                url: "/components/interactions/input-spinner",
                preview: (
                    <div className="flex items-center gap-2.5 text-base-content/70">
                        <div className="flex justify-center items-center bg-base-content/20 p-1.5 rounded-full">
                            <Icon icon="lucide--minus" className="size-4" />
                        </div>
                        <div className="px-2 py-1 border border-base-300 rounded-xs w-18 text-sm">45</div>
                        <div className="flex justify-center items-center bg-base-content/20 p-1.5 rounded-full">
                            <Icon icon="lucide--plus" className="size-4" />
                        </div>
                    </div>
                ),
            },
            {
                id: "interactions-password-meter",
                label: "Password Meter",
                url: "/components/interactions/password-meter",
                preview: (
                    <div className="space-y-1.5 w-3/4 sm:w-3/5">
                        <div className="flex items-center gap-0.5 px-2 py-1.5 border border-base-300 rounded-xs">
                            <div className="bg-base-content/25 rounded-full size-1.5"></div>
                            <div className="bg-base-content/25 rounded-full size-1.5"></div>
                            <div className="bg-base-content/25 rounded-full size-1.5"></div>
                            <div className="bg-base-content/25 rounded-full size-1.5"></div>
                            <div className="bg-base-content/25 rounded-full size-1.5"></div>
                            <div className="bg-base-content/25 rounded-full size-1.5"></div>
                            <Icon icon="lucide--eye-off" className="ms-auto size-3.5 text-base-content/50" />
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="bg-base-content/25 rounded-full h-1.5 grow"></div>
                            <div className="bg-base-content/25 rounded-full h-1.5 grow"></div>
                            <div className="bg-base-content/25 rounded-full h-1.5 grow"></div>
                            <div className="bg-base-content/10 rounded-full h-1.5 grow"></div>
                            <div className="bg-base-content/10 rounded-full h-1.5 grow"></div>
                        </div>
                        <div className="space-y-0.5 mt-2.5">
                            <div className="flex items-center gap-1.5 text-base-content/60">
                                <Icon icon="lucide--check" className="size-2.5" />
                                <div className="bg-base-content/25 rounded-xs w-12 h-1.5"></div>
                            </div>
                            <div className="flex items-center gap-1.5 text-base-content/60">
                                <Icon icon="lucide--check" className="size-2.5" />
                                <div className="bg-base-content/25 rounded-xs w-16 h-1.5"></div>
                            </div>
                            <div className="flex items-center gap-1.5 text-base-content/40">
                                <Icon icon="lucide--check" className="size-2.5" />
                                <div className="bg-base-content/10 rounded-xs w-10 h-1.5"></div>
                            </div>
                        </div>
                    </div>
                ),
            },
            {
                id: "interactions-select",
                label: "Select",
                url: "/components/interactions/select",
                preview: (
                    <div className="border border-base-300 rounded-xs w-3/4 sm:w-1/2">
                        <div className="flex items-center gap-2 p-1.5 border-b border-base-300 text-[10px] text-base-content/70">
                            <div className="bg-base-content/15 px-1.5 py-0.5 rounded-full">Design</div>
                            <p className="grow">Select</p>
                            <Icon icon="lucide--chevron-down" className="size-3" />
                        </div>
                        <div className="space-y-1.5 p-1.5">
                            <div className="bg-base-content/20 rounded-xs w-8 h-2"></div>
                            <div className="bg-base-content/30 rounded-xs w-12 h-2"></div>
                            <div className="bg-base-content/20 rounded-xs w-10 h-2"></div>
                            <div className="bg-base-content/20 rounded-xs w-14 h-2"></div>
                        </div>
                    </div>
                ),
            },
            {
                id: "interactions-sortable",
                label: "Sortable",
                url: "/components/interactions/sortable",
                preview: (
                    <div className="space-y-2.5 text-base-content/60">
                        <div className="flex justify-end items-center bg-base-content/15 rounded-xs w-20 h-4">
                            <Icon icon="lucide--grip-vertical" className="size-3" />
                        </div>
                        <div className="relative bg-base-content/5 border border-base-content/20 border-dashed rounded-xs h-4">
                            <div className="-top-1.5 absolute inset-0 flex justify-end items-center bg-base-content/35 rounded-xs w-20 h-4 start-2.5">
                                <Icon icon="lucide--grip-vertical" className="size-3" />
                            </div>
                        </div>
                        <div className="flex justify-end items-center bg-base-content/15 rounded-xs w-20 h-4">
                            <Icon icon="lucide--grip-vertical" className="size-3" />
                        </div>
                        <div className="flex justify-end items-center bg-base-content/15 rounded-xs w-20 h-4">
                            <Icon icon="lucide--grip-vertical" className="size-3" />
                        </div>
                    </div>
                ),
            },
            {
                id: "interactions-text-editor",
                label: "Text Editor",
                url: "/components/interactions/text-editor",
                preview: (
                    <div className="border border-base-300 rounded-xs w-3/4 sm:w-3/5">
                        <div className="flex items-center gap-1 bg-base-content/10 p-1">
                            <div className="bg-base-content/25 rounded-xs size-2"></div>
                            <div className="bg-base-content/35 rounded-xs size-2"></div>
                            <div className="bg-base-content/25 rounded-xs size-2"></div>
                            <div className="bg-base-content/25 mx-0.5 w-px h-2" />
                            <div className="bg-base-content/25 rounded-xs size-2"></div>
                            <div className="bg-base-content/15 rounded-xs size-2"></div>
                            <div className="bg-base-content/25 ms-auto rounded-xs size-2"></div>
                            <div className="bg-base-content/25 rounded-xs size-2"></div>
                        </div>
                        <div className="bg-base-content/3 p-2 h-16 text-sm text-base-content/70">
                            <p className="font-medium">Hello World</p>
                            <p className="text-xs italic">Write anything</p>
                        </div>
                    </div>
                ),
            },
            {
                id: "interactions-wizard",
                label: "Wizard",
                url: "/components/interactions/wizard",
                preview: (
                    <div className="space-y-2 w-3/4 sm:w-3/5">
                        <div className="flex items-center gap-1.5">
                            <div className="bg-base-content/30 rounded-full size-2"></div>
                            <div className="bg-base-content/20 rounded-xs w-5 h-1.5"></div>
                            <div className="bg-base-content/30 rounded-full size-2"></div>
                            <div className="bg-base-content/20 rounded-xs w-5 h-1.5"></div>
                            <div className="bg-base-content/30 rounded-full size-2"></div>
                            <div className="bg-base-content/20 rounded-xs w-5 h-1.5"></div>
                        </div>
                        <div className="bg-base-content/5 rounded-xs w-full h-12"></div>
                        <div className="flex justify-between items-center gap-1.5">
                            <div className="bg-base-content/25 rounded-xs w-6 h-3"></div>
                            <div className="bg-base-content/30 rounded-xs w-6 h-3"></div>
                        </div>
                    </div>
                ),
            },
        ],
    },
    {
        id: "apex-charts",
        label: "Apex Charts",
        icon: "lucide--chart-bar",
        children: [
            {
                id: "apex-charts-area",
                label: "Area",
                url: "/components/apex-charts/area",
                preview: (
                    <svg viewBox="0 0 150 100" className="w-4/5 sm:w-3/5">
                        <line x1="20" y1="10" x2="20" y2="90" className="stroke-base-content/20" strokeWidth="1.5" />
                        <line x1="20" y1="90" x2="140" y2="90" className="stroke-base-content/20" strokeWidth="1.5" />
                        <path
                            d="M20 90 L35 70 Q42 60, 50 65 T65 50 Q72 40, 80 45 T95 30 Q102 25, 110 30 L125 20 L125 90 L20 90 Z"
                            className="fill-base-content/20"
                        />
                        <path
                            d="M20 90 L35 70 Q42 60, 50 65 T65 50 Q72 40, 80 45 T95 30 Q102 25, 110 30 L125 20"
                            className="stroke-base-content/30"
                            fill="none"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                ),
            },
            {
                id: "apex-charts-bar",
                label: "Bar",
                url: "/components/apex-charts/bar",
                preview: (
                    <svg viewBox="0 0 150 100" className="w-4/5 sm:w-3/5">
                        <line x1="20" y1="95" x2="140" y2="95" className="stroke-base-content/20" strokeWidth="1.5" />

                        <line x1="20" y1="10" x2="20" y2="95" className="stroke-base-content/20" strokeWidth="1.5" />

                        <rect x="20" y="15" width="70" height="12" rx="1" className="fill-base-content/30" />
                        <rect x="20" y="35" width="40" height="12" rx="1" className="fill-base-content/30" />
                        <rect x="20" y="55" width="90" height="12" rx="1" className="fill-base-content/30" />
                        <rect x="20" y="75" width="55" height="12" rx="1" className="fill-base-content/30" />
                    </svg>
                ),
            },
            {
                id: "apex-charts-column",
                label: "Column",
                url: "/components/apex-charts/column",
                preview: (
                    <svg viewBox="0 0 150 100" className="w-4/5 sm:w-3/5">
                        <line x1="20" y1="10" x2="20" y2="90" className="stroke-base-content/20" strokeWidth="1.5" />

                        <line x1="20" y1="90" x2="140" y2="90" className="stroke-base-content/20" strokeWidth="1.5" />

                        <rect x="30" y="70" width="14" height="20" rx="2" className="fill-base-content/50" />
                        <rect x="30" y="50" width="14" height="20" rx="2" className="fill-base-content/35" />
                        <rect x="30" y="30" width="14" height="20" rx="2" className="fill-base-content/20" />

                        <rect x="55" y="60" width="14" height="30" rx="2" className="fill-base-content/50" />
                        <rect x="55" y="40" width="14" height="20" rx="2" className="fill-base-content/35" />
                        <rect x="55" y="25" width="14" height="15" rx="2" className="fill-base-content/20" />

                        <rect x="80" y="65" width="14" height="25" rx="2" className="fill-base-content/50" />
                        <rect x="80" y="45" width="14" height="20" rx="2" className="fill-base-content/35" />
                        <rect x="80" y="30" width="14" height="15" rx="2" className="fill-base-content/20" />

                        <rect x="105" y="75" width="14" height="15" rx="2" className="fill-base-content/50" />
                        <rect x="105" y="60" width="14" height="15" rx="2" className="fill-base-content/35" />
                        <rect x="105" y="45" width="14" height="15" rx="2" className="fill-base-content/20" />
                    </svg>
                ),
            },
            {
                id: "apex-charts-line",
                label: "Line",
                url: "/components/apex-charts/line",
                preview: (
                    <svg viewBox="0 0 150 100" className="w-4/5 sm:w-3/5">
                        <line x1="20" y1="90" x2="140" y2="90" className="stroke-base-content/20" strokeWidth="1.5" />
                        <line x1="20" y1="10" x2="20" y2="90" className="stroke-base-content/20" strokeWidth="1.5" />
                        <polyline
                            fill="none"
                            className="stroke-base-content/40"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="miter"
                            points="20,80 45,60 70,40 95,55 120,35"
                        />
                        <path
                            d="M20,50 C35,45 55,40 70,45 S110,55 140,50"
                            fill="none"
                            className="stroke-base-content/20"
                            strokeWidth="2"
                            strokeLinecap="round"
                        />
                        <path
                            d="M20,70 C35,65 55,60 70,65 S110,75 140,70"
                            fill="none"
                            className="stroke-base-content/20"
                            strokeWidth="2"
                            strokeLinecap="round"
                        />
                    </svg>
                ),
            },
            {
                id: "apex-charts-pie",
                label: "Pie",
                url: "/components/apex-charts/pie",
                preview: (
                    <div>
                        <svg className="size-24" viewBox="0 0 120 120">
                            <g
                                transform="translate(60,60)"
                                className="stroke-base-100/60"
                                strokeWidth="2.5"
                                strokeLinejoin="round">
                                <path d=" M 0 0 L 0 -58 A 58 58 0 0 1 34.8 -49.3 Z " className="fill-base-content/60" />
                                <path
                                    d=" M 0 0 L 34.8 -49.3 A 58 58 0 0 1 57.6 9.3 Z "
                                    className="fill-base-content/15"
                                />
                                <path
                                    d=" M 0 0 L 57.6 9.3 A 58 58 0 0 1 17.4 55.4 Z "
                                    fill="#f59e0b"
                                    className="fill-base-content/35"
                                />
                                <path
                                    d=" M 0 0 L 17.4 55.4 A 58 58 0 0 1 -44.7 38.6 Z "
                                    fill="#ef4444"
                                    className="fill-base-content/55"
                                />
                                <path
                                    d=" M 0 0 L -44.7 38.6 A 58 58 0 0 1 0 -58 Z "
                                    fill="#8b5cf6"
                                    className="fill-base-content/45"
                                />
                            </g>
                        </svg>
                    </div>
                ),
            },
        ],
    },
];

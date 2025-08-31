import React, { Suspense, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Link } from "react-router";

import { PageTitle } from "@/components/PageTitle";
import { Rightbar } from "@/components/admin-layout/Rightbar";
import { useConfig } from "@/contexts/config";

import { footers, sidebars, topbars } from "./list";

const fallbackSidebar = sidebars[0].comp;
const fallbackTopbar = topbars[0].comp;
const fallbackFooter = footers[0].comp;
const SidebarLoader = () => {
    return (
        <div className="p-3 w-full h-full">
            <div className="bg-base-200/20 w-full h-full skeleton" />
        </div>
    );
};

const LayoutBuilderPage = () => {
    const { calculatedSidebarTheme } = useConfig();

    const [selectedSidebar, setSelectedSidebar] = useState<string>(sidebars[0].title);
    const [selectedTopbar, setSelectedTopbar] = useState<string>(topbars[0].title);
    const [selectedFooter, setSelectedFooter] = useState<string>(footers[0].title);

    const Sidebar = useMemo(
        () => sidebars.find((sidebar) => sidebar.title === selectedSidebar)?.comp ?? fallbackSidebar,
        [selectedSidebar],
    );

    const Topbar = useMemo(
        () => topbars.find((topbar) => topbar.title === selectedTopbar)?.comp ?? fallbackTopbar,
        [selectedTopbar],
    );

    const Footer = useMemo(
        () => footers.find((footer) => footer.title === selectedFooter)?.comp ?? fallbackFooter,
        [selectedFooter],
    );

    return (
        <div className="size-full">
            <div className="flex">
                <input
                    type="checkbox"
                    id="layout-sidebar-toggle-trigger"
                    className="hidden"
                    aria-label="Toggle layout sidebar"
                />
                <input
                    type="checkbox"
                    id="layout-sidebar-hover-trigger"
                    className="hidden"
                    aria-label="Dense layout sidebar"
                />
                <div id="layout-sidebar-hover" className="bg-base-300 w-1 h-screen"></div>
                <div id="layout-sidebar" data-theme={calculatedSidebarTheme} className={"overflow-hidden"}>
                    <Suspense fallback={<SidebarLoader />}>
                        <Sidebar />
                    </Suspense>
                </div>
                <label htmlFor="layout-sidebar-toggle-trigger" id="layout-sidebar-backdrop"></label>

                <div className="flex flex-col min-w-0 h-screen overflow-auto grow">
                    <div id="layout-topbar">
                        <Topbar />
                    </div>
                    <div id="layout-content">
                        <PageTitle title="Layout Builder" items={[{ label: "Layout Builder", active: true }]} />
                        <div className="gap-6 grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-5 xl:grid-cols-4 mt-6">
                            <div className="bg-base-100 card-border h-fit card">
                                <div className="flex items-center gap-2 bg-base-200/30 mx-3 mt-3 px-4 py-2 rounded-box font-medium">
                                    <Icon icon="lucide--layout-panel-left" className="size-4" />
                                    Sidebar
                                </div>
                                <div className="space-y-0.5 p-3">
                                    {sidebars.map((sidebar, index) => (
                                        <div
                                            key={index}
                                            onClick={() => setSelectedSidebar(sidebar.title)}
                                            className={`hover:bg-base-200 rounded-box flex cursor-pointer items-center gap-2 px-2.5 py-1 ${selectedSidebar === sidebar.title ? "bg-base-200" : ""}`}>
                                            <div className="w-5">
                                                {selectedSidebar == sidebar.title && (
                                                    <Icon icon="lucide--check" className="block" />
                                                )}
                                            </div>
                                            <div>{sidebar.title}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-base-100 card-border h-fit card">
                                <div className="flex items-center gap-2 bg-base-200/30 mx-3 mt-3 px-4 py-2 rounded-box font-medium">
                                    <Icon icon="lucide--layout-panel-top" className="size-4" />
                                    Topbar
                                </div>
                                <div className="space-y-0.5 p-3">
                                    {topbars.map((topbar, index) => (
                                        <div
                                            key={index}
                                            onClick={() => setSelectedTopbar(topbar.title)}
                                            className={`hover:bg-base-200 rounded-box flex cursor-pointer items-center gap-2 px-2.5 py-1 ${selectedTopbar === topbar.title ? "bg-base-200" : ""}`}>
                                            <div className="w-5">
                                                {selectedTopbar == topbar.title && (
                                                    <Icon icon="lucide--check" className="block" />
                                                )}
                                            </div>
                                            <div>{topbar.title}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="bg-base-100 card-border h-fit card">
                                <div className="flex items-center gap-2 bg-base-200/30 mx-3 mt-3 px-4 py-2 rounded-box font-medium">
                                    <Icon icon="lucide--layout-panel-top" className="size-4 rotate-180" />
                                    Footer
                                </div>
                                <div className="space-y-0.5 p-3">
                                    {footers.map((footer, index) => (
                                        <div
                                            key={index}
                                            onClick={() => setSelectedFooter(footer.title)}
                                            className={`hover:bg-base-200 rounded-box flex cursor-pointer items-center gap-2 px-2.5 py-1 ${selectedFooter === footer.title ? "bg-base-200" : ""}`}>
                                            <div className="w-5">
                                                {selectedFooter == footer.title && (
                                                    <Icon icon="lucide--check" className="block" />
                                                )}
                                            </div>
                                            <div>{footer.title}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="bg-base-100 mt-8 2xl:mt-16 xl:mt-12 p-5 border border-base-200 rounded-box max-w-md">
                            <p className="font-medium text-info">Note:</p>
                            <p className="mt-1 text-sm text-base-content/80">
                                All layout components, including the{" "}
                                <Link className="text-primary link link-hover" to="/components/layouts/sidebar">
                                    sidebar
                                </Link>
                                ,{" "}
                                <Link className="text-primary link link-hover" to="/components/layouts/topbar">
                                    topbar
                                </Link>{" "}
                                and{" "}
                                <Link className="text-primary link link-hover" to="/components/layouts/footer">
                                    footer
                                </Link>{" "}
                                are available in the components section for easy access and customization.
                            </p>
                        </div>
                    </div>
                    <div className="px-4 py-1">
                        <Footer />
                    </div>
                </div>
            </div>
            <div className="bottom-16 z-100 fixed end-16">
                <label
                    htmlFor="layout-rightbar-drawer"
                    className="shadow-lg shadow-primary/20 hover:shadow-xl btn btn-circle btn-lg btn-primary drawer-button">
                    <Icon icon="lucide--palette" className="size-6" />
                </label>
                <Rightbar />
            </div>
        </div>
    );
};

export default LayoutBuilderPage;

import React, { Suspense, useMemo, useState } from "react";
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
        <div className="h-full w-full p-3">
            <div className="skeleton bg-base-200/20 h-full w-full" />
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
                <div id="layout-sidebar-hover" className="bg-base-300 h-screen w-1"></div>
                <div id="layout-sidebar" data-theme={calculatedSidebarTheme} className={"overflow-hidden"}>
                    <Suspense fallback={<SidebarLoader />}>
                        <Sidebar />
                    </Suspense>
                </div>
                <label htmlFor="layout-sidebar-toggle-trigger" id="layout-sidebar-backdrop"></label>

                <div className="flex h-screen min-w-0 grow flex-col overflow-auto">
                    <div id="layout-topbar">
                        <Topbar />
                    </div>
                    <div id="layout-content">
                        <PageTitle title="Layout Builder" items={[{ label: "Layout Builder", active: true }]} />
                        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                            <div className="bg-base-100 card card-border h-fit">
                                <div className="bg-base-200/30 rounded-box mx-3 mt-3 flex items-center gap-2 px-4 py-2 font-medium">
                                    <span className="iconify lucide--layout-panel-left size-4"></span>
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
                                                    <span className="iconify lucide--check block"></span>
                                                )}
                                            </div>
                                            <div>{sidebar.title}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="card card-border bg-base-100 h-fit">
                                <div className="bg-base-200/30 rounded-box mx-3 mt-3 flex items-center gap-2 px-4 py-2 font-medium">
                                    <span className="iconify lucide--layout-panel-top size-4"></span>
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
                                                    <span className="iconify lucide--check block"></span>
                                                )}
                                            </div>
                                            <div>{topbar.title}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="card card-border bg-base-100 h-fit">
                                <div className="bg-base-200/30 rounded-box mx-3 mt-3 flex items-center gap-2 px-4 py-2 font-medium">
                                    <span className="iconify lucide--layout-panel-top size-4 rotate-180"></span>
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
                                                    <span className="iconify lucide--check block"></span>
                                                )}
                                            </div>
                                            <div>{footer.title}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="bg-base-100 rounded-box border-base-200 mt-8 max-w-md border p-5 xl:mt-12 2xl:mt-16">
                            <p className="text-info font-medium">Note:</p>
                            <p className="text-base-content/80 mt-1 text-sm">
                                All layout components, including the{" "}
                                <Link className="link link-hover text-primary" to="/components/layouts/sidebar">
                                    sidebar
                                </Link>
                                ,{" "}
                                <Link className="link link-hover text-primary" to="/components/layouts/topbar">
                                    topbar
                                </Link>{" "}
                                and{" "}
                                <Link className="link link-hover text-primary" to="/components/layouts/footer">
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
            <div className="fixed end-16 bottom-16 z-100">
                <label
                    htmlFor="layout-rightbar-drawer"
                    className="btn btn-circle btn-lg btn-primary shadow-primary/20 drawer-button shadow-lg hover:shadow-xl">
                    <span className="iconify lucide--palette size-6" />
                </label>
                <Rightbar />
            </div>
        </div>
    );
};

export default LayoutBuilderPage;

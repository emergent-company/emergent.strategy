import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import SimpleBarCore from "simplebar-core";
// @ts-ignore
import SimpleBar from "simplebar-react";
import "simplebar-react/dist/simplebar.min.css";

import { Logo } from "@/components/Logo";
import { useConfig } from "@/contexts/config";

import { ISidebarMenuItem, SidebarMenuItem } from "./SidebarMenuItem";
import { getActivatedItemParentKeys } from "./helpers";

export const Sidebar = ({ menuItems }: { menuItems: ISidebarMenuItem[] }) => {
    const { pathname } = useLocation();
    const { calculatedSidebarTheme } = useConfig();
    const scrollRef = useRef<SimpleBarCore | null>(null);
    const hasMounted = useRef(false);

    const [activatedParents, setActivatedParents] = useState<Set<string>>(new Set());

    useEffect(() => {
        setActivatedParents(getActivatedItemParentKeys(menuItems, pathname));
    }, [menuItems, pathname]);

    const onToggleActivated = (key: string) => {
        if (activatedParents.has(key)) {
            activatedParents.delete(key);
        } else {
            activatedParents.add(key);
        }
        setActivatedParents(new Set(activatedParents));
    };

    useEffect(() => {
        setTimeout(() => {
            const contentElement = scrollRef.current?.getContentElement();
            const scrollElement = scrollRef.current?.getScrollElement();
            if (contentElement) {
                const activatedItem = contentElement.querySelector<HTMLElement>(".active");
                const top = activatedItem?.getBoundingClientRect().top;
                if (activatedItem && scrollElement && top && top !== 0) {
                    scrollElement.scrollTo({ top: scrollElement.scrollTop + top - 300, behavior: "smooth" });
                }
            }
        }, 100);
    }, [activatedParents, scrollRef]);

    useEffect(() => {
        if (!hasMounted.current) {
            hasMounted.current = true;
            return;
        }
        if (window.innerWidth <= 64 * 16) {
            const sidebarTrigger = document.querySelector<HTMLInputElement>("#layout-sidebar-toggle-trigger");
            if (sidebarTrigger) {
                sidebarTrigger.checked = false;
            }
        }
    }, [pathname]);

    return (
        <>
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

            <div id="layout-sidebar" className="flex flex-col sidebar-menu" data-theme={calculatedSidebarTheme}>
                <div className="flex justify-between items-center gap-3 ps-5 pe-4 h-16 min-h-16">
                    <Link to="/admin">
                        <Logo />
                    </Link>
                    <label
                        htmlFor="layout-sidebar-hover-trigger"
                        title="Toggle sidebar hover"
                        className="max-lg:hidden relative text-base-content/50 btn btn-circle btn-ghost btn-sm">
                        <span className="lucide--panel-left-close absolute opacity-100 group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:opacity-0 size-4.5 transition-all duration-300 iconify" />
                        <span className="lucide--panel-left-dashed absolute opacity-0 group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:opacity-100 size-4.5 transition-all duration-300 iconify" />
                    </label>
                </div>
                <div className="relative min-h-0 grow">
                    <SimpleBar ref={scrollRef} className="size-full">
                        <div className="space-y-0.5 mb-3 px-2.5">
                            {menuItems.map((item, index) => (
                                <SidebarMenuItem
                                    {...item}
                                    key={index}
                                    activated={activatedParents}
                                    onToggleActivated={onToggleActivated}
                                />
                            ))}
                        </div>
                    </SimpleBar>
                    <div className="bottom-0 absolute bg-linear-to-t from-base-100/60 to-transparent h-7 pointer-events-none start-0 end-0"></div>
                </div>

                <div className="mb-2">
                    <Link to="/components" target="_blank" className="group block relative gap-3 mx-2.5 rounded-box">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-transparent group-hover:opacity-0 rounded-box transition-opacity duration-300"></div>
                        <div className="absolute inset-0 bg-gradient-to-r from-primary to-secondary opacity-0 group-hover:opacity-100 rounded-box transition-opacity duration-300"></div>

                        <div className="relative flex items-center gap-3 px-3 h-10">
                            <i className="size-4.5 text-primary group-hover:text-primary-content transition-all duration-300 iconify lucide--shapes"></i>
                            <p className="bg-clip-text bg-gradient-to-r from-primary to-secondary font-medium text-transparent group-hover:text-primary-content transition-all duration-300">
                                Components
                            </p>
                            <i className="lucide--chevron-right ms-auto size-4.5 text-secondary group-hover:text-secondary-content transition-all duration-300 iconify"></i>
                        </div>
                    </Link>
                    <hr className="my-2 border-base-300 border-dashed" />
                    <div className="dropdown-top w-full dropdown dropdown-end">
                        <div
                            tabIndex={0}
                            role="button"
                            className="flex items-center gap-2.5 bg-base-200 hover:bg-base-300 mx-2 mt-0 px-3 py-2 rounded-box transition-all cursor-pointer">
                            <div className="avatar">
                                <div className="bg-base-200 w-8 mask mask-squircle">
                                    <img src="/images/avatars/1.png" alt="Avatar" />
                                </div>
                            </div>
                            <div className="-space-y-0.5 grow">
                                <p className="font-medium text-sm">Denish N</p>
                                <p className="text-xs text-base-content/60">@withden</p>
                            </div>
                            <span className="size-4 text-base-content/60 iconify lucide--chevrons-up-down" />
                        </div>
                        <ul
                            role="menu"
                            tabIndex={0}
                            className="bg-base-100 shadow-[0px_-10px_40px_0px] shadow-base-content/4 mb-1 p-1 rounded-box w-48 dropdown-content menu">
                            <li>
                                <Link to="/pages/settings">
                                    <span className="size-4 iconify lucide--user" />
                                    <span>My Profile</span>
                                </Link>
                            </li>
                            <li>
                                <Link to="/pages/settings">
                                    <span className="size-4 iconify lucide--settings" />
                                    <span>Settings</span>
                                </Link>
                            </li>
                            <li>
                                <Link to="/pages/get-help">
                                    <span className="size-4 iconify lucide--help-circle" />
                                    <span>Help</span>
                                </Link>
                            </li>
                            <li>
                                <div>
                                    <span className="size-4 iconify lucide--bell" />
                                    <span>Notification</span>
                                </div>
                            </li>
                            <li>
                                <div>
                                    <span className="lucide--arrow-left-right size-4 iconify" />
                                    <span>Switch Account</span>
                                </div>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>

            <label htmlFor="layout-sidebar-toggle-trigger" id="layout-sidebar-backdrop"></label>
        </>
    );
};

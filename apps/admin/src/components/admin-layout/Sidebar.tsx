import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import SimpleBarCore from "simplebar-core";
// @ts-ignore
import SimpleBar from "simplebar-react";
import "simplebar-react/dist/simplebar.min.css";

import { Logo } from "@/components/Logo";
import { Icon } from "@/components/ui/Icon";
import { useConfig } from "@/contexts/config";

import { ISidebarMenuItem, SidebarMenuItem } from "./SidebarMenuItem";
import { getActivatedItemParentKeys } from "./helpers";
import { SidebarProjectDropdown } from "./SidebarProjectDropdown";

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
                        <Icon icon="lucide--panel-left-close" className="absolute opacity-100 group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:opacity-0 size-4.5 transition-all duration-300" />
                        <Icon icon="lucide--panel-left-dashed" className="absolute opacity-0 group-has-[[id=layout-sidebar-hover-trigger]:checked]/html:opacity-100 size-4.5 transition-all duration-300" />
                    </label>
                </div>
                {/* Project switcher (Sidebar "Project" variant) */}
                <SidebarProjectDropdown />

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

                {/* Sidebar footer removed: Components link and avatar options menu */}
            </div>

            <label htmlFor="layout-sidebar-toggle-trigger" id="layout-sidebar-backdrop"></label>
        </>
    );
};

import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router";
// @ts-ignore
import SimpleBar from "simplebar-react";
import "simplebar-react/dist/simplebar.min.css";

import { Logo } from "@/components/Logo";

import { ISidebarMenuItem, SidebarMenuItem } from "../admin-layout/SidebarMenuItem";
import { getActivatedItemParentKeys } from "../admin-layout/helpers";

export const Sidebar = ({ menuItems }: { menuItems: ISidebarMenuItem[] }) => {
    const { pathname } = useLocation();

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

    return (
        <div className="border-base-300/80 bg-base-100 sticky top-0 bottom-0 flex h-screen w-64 min-w-64 flex-col border-s border-e border-dashed">
            <div className="border-base-300 flex h-16 min-h-16 items-center gap-4 border-b border-dashed px-5">
                <Link to="/">
                    <Logo />
                </Link>
                <hr className="border-base-300 h-6 border-e" />
                <p className="text-base-content/60 mt-0.5 text-lg font-medium">Design</p>
            </div>
            <SimpleBar className="h-full min-h-0 grow">
                <div className="sidebar-menu mt-4 space-y-0.5 px-2.5 pb-4">
                    {menuItems.map((item) => {
                        return (
                            <SidebarMenuItem
                                {...item}
                                activated={activatedParents}
                                key={item.id}
                                onToggleActivated={onToggleActivated}
                            />
                        );
                    })}
                </div>
            </SimpleBar>
            <div className="mt-2">
                <Link
                    to="/dashboards/ecommerce"
                    target="_blank"
                    className="group rounded-box relative mx-2.5 block gap-3">
                    <div className="rounded-box absolute inset-0 bg-gradient-to-r from-transparent to-transparent transition-opacity duration-300 group-hover:opacity-0"></div>
                    <div className="from-primary to-secondary rounded-box absolute inset-0 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>

                    <div className="relative flex h-10 items-center gap-3 px-3">
                        <i className="iconify lucide--monitor-dot text-primary size-4.5 transition-all duration-300 group-hover:text-white"></i>
                        <p className="from-primary to-secondary bg-gradient-to-r bg-clip-text font-medium text-transparent transition-all duration-300 group-hover:text-white">
                            Dashboard
                        </p>
                        <i className="iconify lucide--chevron-right text-secondary ms-auto size-4.5 transition-all duration-300 group-hover:text-white"></i>
                    </div>
                </Link>
                <hr className="border-base-300 mt-2 border-dashed" />
                <Link
                    to="https://nexus.daisyui.com/docs/"
                    target="_blank"
                    className="bg-base-200/60 hover:bg-base-200 rounded-box m-2.5 mb-2 flex cursor-pointer items-center gap-3 px-3.5 py-2 transition-all">
                    <span className="iconify lucide--book-open-text size-5"></span>
                    <div className="grow -space-y-0.5">
                        <p className="text-sm font-medium">Documentation</p>
                        <p className="text-base-content/60 text-xs">Installations</p>
                    </div>
                    <span className="iconify lucide--external-link text-base-content/60 size-4" />
                </Link>
            </div>
        </div>
    );
};

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
        <div className="top-0 bottom-0 sticky flex flex-col bg-base-100 border-e border-s border-base-300/80 border-dashed w-64 min-w-64 h-screen">
            <div className="flex items-center gap-4 px-5 border-b border-base-300 border-dashed h-16 min-h-16">
                <Link to="/">
                    <Logo />
                </Link>
                <hr className="border-e border-base-300 h-6" />
                <p className="mt-0.5 font-medium text-base-content/60 text-lg">Design</p>
            </div>
            <SimpleBar className="h-full min-h-0 grow">
                <div className="space-y-0.5 mt-4 px-2.5 pb-4 sidebar-menu">
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
                    to="/admin"
                    target="_blank"
                    className="group block relative gap-3 mx-2.5 rounded-box">
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent to-transparent group-hover:opacity-0 rounded-box transition-opacity duration-300"></div>
                    <div className="absolute inset-0 bg-gradient-to-r from-primary to-secondary opacity-0 group-hover:opacity-100 rounded-box transition-opacity duration-300"></div>

                    <div className="relative flex items-center gap-3 px-3 h-10">
                        <i className="size-4.5 text-primary group-hover:text-white transition-all duration-300 iconify lucide--monitor-dot"></i>
                        <p className="bg-clip-text bg-gradient-to-r from-primary to-secondary font-medium text-transparent group-hover:text-white transition-all duration-300">
                            Dashboard
                        </p>
                        <i className="lucide--chevron-right ms-auto size-4.5 text-secondary group-hover:text-white transition-all duration-300 iconify"></i>
                    </div>
                </Link>
                <hr className="mt-2 border-base-300 border-dashed" />
                <Link
                    to="https://nexus.daisyui.com/docs/"
                    target="_blank"
                    className="flex items-center gap-3 bg-base-200/60 hover:bg-base-200 m-2.5 mb-2 px-3.5 py-2 rounded-box transition-all cursor-pointer">
                    <span className="size-5 iconify lucide--book-open-text"></span>
                    <div className="-space-y-0.5 grow">
                        <p className="font-medium text-sm">Documentation</p>
                        <p className="text-xs text-base-content/60">Installations</p>
                    </div>
                    <span className="size-4 text-base-content/60 iconify lucide--external-link" />
                </Link>
            </div>
        </div>
    );
};

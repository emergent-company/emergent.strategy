import { type ReactNode } from "react";

import { Footer } from "@/components/components-layout/Footer";
import { Sidebar } from "@/components/components-layout/Sidebar";
import { Topbar } from "@/components/components-layout/Topbar";

import { componentsMenuItems } from "./menu";

const Layout = ({ children }: { children: ReactNode }) => {
    return (
        <div id="components-layout">
            <div id="components-layout-container">
                <div className="max-xl:hidden">
                    <Sidebar menuItems={componentsMenuItems} />
                </div>
                <div id="components-layout-main">
                    <Topbar />
                    <div id="components-layout-content">{children}</div>
                    <Footer />
                </div>
            </div>
        </div>
    );
};

export default Layout;

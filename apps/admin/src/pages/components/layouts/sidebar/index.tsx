import React from "react";
import { Link } from "react-router";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { ChatSidebarDemo } from "./ChatSidebarDemo";
import { CustomBackgroundSidebarDemo } from "./CustomBackgroundSidebarDemo";
import { DocumentationSidebarDemo } from "./DocumentationSidebarDemo";
import { EcommerceSidebarDemo } from "./EcommerceSidebarDemo";
import { HugeIconsSidebarDemo } from "./HugeIconsSidebarDemo";
import { PaymentSidebarDemo } from "./PaymentSidebarDemo";
import { ProjectSidebarDemo } from "./ProjectSidebarDemo";
import { RemixIconsSidebarDemo } from "./RemixIconsSidebarDemo";

const SidebarPage = () => {
    return (
        <div>
            <MetaData title="Sidebar - Layouts" />
            <ComponentPageTitle
                label="Layouts"
                title="Sidebar"
                description="Custom sidebar layouts with icons, project menus, docs view, and background styling options"
            />
            <div className="bg-base-200/40 rounded-box mt-6 flex items-center gap-3 px-5 py-4 lg:mt-12">
                <span className="iconify lucide--info text-base-content/70 size-4.5"></span>
                <p>
                    <span className="me-1">Play with layouts using</span>
                    <Link to="/layout-builder" target="_blank" className="text-primary">
                        Layout Builder
                    </Link>
                </p>
            </div>
            <p className="text-base-content/60 mt-6 font-medium">Demos</p>
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 xl:gap-8">
                <div className="card bg-base-100 card-border overflow-hidden">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Ecommerce</div>
                    <div className="flex items-center justify-center p-6 md:p-8">
                        <div className="border-base-200 rounded-box h-full min-h-[85vh] w-64 border shadow-xs">
                            <EcommerceSidebarDemo />
                        </div>
                    </div>
                </div>
                <div className="card bg-base-100 card-border overflow-hidden">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Payment</div>
                    <div className="flex items-center justify-center p-6 md:p-8">
                        <div className="border-base-200 rounded-box h-full min-h-[85vh] w-64 border shadow-xs">
                            <PaymentSidebarDemo />
                        </div>
                    </div>
                </div>
                <div className="card bg-base-100 card-border overflow-hidden">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Project</div>
                    <div className="flex items-center justify-center p-6 md:p-8">
                        <div className="border-base-200 rounded-box h-full min-h-[85vh] w-64 border shadow-xs">
                            <ProjectSidebarDemo />
                        </div>
                    </div>
                </div>
                <div className="card bg-base-100 card-border overflow-hidden">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Chat</div>
                    <div className="flex items-center justify-center p-6 md:p-8">
                        <div className="border-base-200 rounded-box h-full min-h-[85vh] w-64 border shadow-xs">
                            <ChatSidebarDemo />
                        </div>
                    </div>
                </div>

                <div className="card bg-base-100 card-border overflow-hidden">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Huge Icons</div>
                    <div className="flex items-center justify-center p-6 md:p-8">
                        <div className="border-base-200 rounded-box h-full min-h-[85vh] w-64 border shadow-xs">
                            <HugeIconsSidebarDemo />
                        </div>
                    </div>
                </div>
                <div className="card bg-base-100 card-border overflow-hidden">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Remix Icons</div>
                    <div className="flex items-center justify-center p-6 md:p-8">
                        <div className="border-base-200 rounded-box h-full min-h-[85vh] w-64 border shadow-xs">
                            <RemixIconsSidebarDemo />
                        </div>
                    </div>
                </div>
                <div className="card bg-base-100 card-border overflow-hidden">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Documentation</div>
                    <div className="flex items-center justify-center p-6 md:p-8">
                        <div className="border-base-200 rounded-box h-full min-h-[85vh] w-64 border shadow-xs">
                            <DocumentationSidebarDemo />
                        </div>
                    </div>
                </div>
                <div className="card bg-base-100 card-border overflow-hidden">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Custom Background</div>
                    <div className="flex items-center justify-center p-6 md:p-8">
                        <div className="rounded-box h-full min-h-[85vh] w-64 overflow-hidden">
                            <CustomBackgroundSidebarDemo />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SidebarPage;

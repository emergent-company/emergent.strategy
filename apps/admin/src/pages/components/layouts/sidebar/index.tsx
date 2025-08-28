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
            <div className="flex items-center gap-3 bg-base-200/40 mt-6 lg:mt-12 px-5 py-4 rounded-box">
                <span className="size-4.5 text-base-content/70 iconify lucide--info"></span>
                <p>
                    <span className="me-1">Play with layouts using</span>
                    <Link to="/admin/tools/layout-builder" target="_blank" className="text-primary">
                        Layout Builder
                    </Link>
                </p>
            </div>
            <p className="mt-6 font-medium text-base-content/60">Demos</p>
            <div className="gap-6 xl:gap-8 grid grid-cols-1 lg:grid-cols-2 mt-6">
                <div className="bg-base-100 card-border overflow-hidden card">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Ecommerce</div>
                    <div className="flex justify-center items-center p-6 md:p-8">
                        <div className="shadow-xs border border-base-200 rounded-box w-64 h-full min-h-[85vh]">
                            <EcommerceSidebarDemo />
                        </div>
                    </div>
                </div>
                <div className="bg-base-100 card-border overflow-hidden card">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Payment</div>
                    <div className="flex justify-center items-center p-6 md:p-8">
                        <div className="shadow-xs border border-base-200 rounded-box w-64 h-full min-h-[85vh]">
                            <PaymentSidebarDemo />
                        </div>
                    </div>
                </div>
                <div className="bg-base-100 card-border overflow-hidden card">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Project</div>
                    <div className="flex justify-center items-center p-6 md:p-8">
                        <div className="shadow-xs border border-base-200 rounded-box w-64 h-full min-h-[85vh]">
                            <ProjectSidebarDemo />
                        </div>
                    </div>
                </div>
                <div className="bg-base-100 card-border overflow-hidden card">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Chat</div>
                    <div className="flex justify-center items-center p-6 md:p-8">
                        <div className="shadow-xs border border-base-200 rounded-box w-64 h-full min-h-[85vh]">
                            <ChatSidebarDemo />
                        </div>
                    </div>
                </div>

                <div className="bg-base-100 card-border overflow-hidden card">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Huge Icons</div>
                    <div className="flex justify-center items-center p-6 md:p-8">
                        <div className="shadow-xs border border-base-200 rounded-box w-64 h-full min-h-[85vh]">
                            <HugeIconsSidebarDemo />
                        </div>
                    </div>
                </div>
                <div className="bg-base-100 card-border overflow-hidden card">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Remix Icons</div>
                    <div className="flex justify-center items-center p-6 md:p-8">
                        <div className="shadow-xs border border-base-200 rounded-box w-64 h-full min-h-[85vh]">
                            <RemixIconsSidebarDemo />
                        </div>
                    </div>
                </div>
                <div className="bg-base-100 card-border overflow-hidden card">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Documentation</div>
                    <div className="flex justify-center items-center p-6 md:p-8">
                        <div className="shadow-xs border border-base-200 rounded-box w-64 h-full min-h-[85vh]">
                            <DocumentationSidebarDemo />
                        </div>
                    </div>
                </div>
                <div className="bg-base-100 card-border overflow-hidden card">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Custom Background</div>
                    <div className="flex justify-center items-center p-6 md:p-8">
                        <div className="rounded-box w-64 h-full min-h-[85vh] overflow-hidden">
                            <CustomBackgroundSidebarDemo />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SidebarPage;

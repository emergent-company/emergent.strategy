import React from "react";
import { Link } from "react-router";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { ClassicTopbarDemo } from "./ClassicTopbarDemo";
import { CustomBackgroundTopbarDemo } from "./CustomBackgroundTopbarDemo";
import { EditorTopbarDemo } from "./EditorTopbarDemo";
import { GreetingTopbarDemo } from "./GreetingTopbarDemo";
import { NavMenu1TopbarDemo } from "./NavMenu1TopbarDemo";
import { NavMenu2TopbarDemo } from "./NavMenu2TopbarDemo";

const TopbarPage = () => {
    return (
        <div>
            <MetaData title="Topbar - Layouts" />
            <ComponentPageTitle
                label="Layouts"
                title="Topbar"
                description="Topbar demos show basic layouts, greetings, navigation menus, and editor integration options"
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

            <div className="space-y-6 mt-6 pb-20">
                <div className="bg-base-100 card-border card">
                    <div className="bg-base-200/30 px-5 py-3 rounded-t-box font-medium">Classic</div>
                    <div className="h-15">
                        <ClassicTopbarDemo />
                    </div>
                </div>
                <div className="bg-base-100 card-border card">
                    <div className="bg-base-200/30 px-5 py-3 rounded-t-box font-medium">Greeting</div>
                    <div className="h-15">
                        <GreetingTopbarDemo />
                    </div>
                </div>
                <div className="bg-base-100 card-border card">
                    <div className="bg-base-200/30 px-5 py-3 rounded-t-box font-medium">Nav Menu 1</div>
                    <div className="h-15">
                        <NavMenu1TopbarDemo />
                    </div>
                </div>

                <div className="bg-base-100 card-border card">
                    <div className="bg-base-200/30 px-5 py-3 rounded-t-box font-medium">Nav Menu 2</div>
                    <div className="h-15">
                        <NavMenu2TopbarDemo />
                    </div>
                </div>
                <div className="bg-base-100 card-border card">
                    <div className="bg-base-200/30 px-5 py-3 rounded-t-box font-medium">Editor</div>
                    <div className="h-15">
                        <EditorTopbarDemo />
                    </div>
                </div>
                <div className="bg-base-100 card-border card">
                    <div className="bg-base-200/30 px-5 py-3 rounded-t-box font-medium">Custom Background</div>
                    <div className="h-15">
                        <CustomBackgroundTopbarDemo />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TopbarPage;

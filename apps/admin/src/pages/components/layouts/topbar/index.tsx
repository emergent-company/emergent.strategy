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

            <div className="mt-6 space-y-6 pb-20">
                <div className="card bg-base-100 card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Classic</div>
                    <div className="h-15">
                        <ClassicTopbarDemo />
                    </div>
                </div>
                <div className="card bg-base-100 card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Greeting</div>
                    <div className="h-15">
                        <GreetingTopbarDemo />
                    </div>
                </div>
                <div className="card bg-base-100 card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Nav Menu 1</div>
                    <div className="h-15">
                        <NavMenu1TopbarDemo />
                    </div>
                </div>

                <div className="card bg-base-100 card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Nav Menu 2</div>
                    <div className="h-15">
                        <NavMenu2TopbarDemo />
                    </div>
                </div>
                <div className="card bg-base-100 card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Editor</div>
                    <div className="h-15">
                        <EditorTopbarDemo />
                    </div>
                </div>
                <div className="card bg-base-100 card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Custom Background</div>
                    <div className="h-15">
                        <CustomBackgroundTopbarDemo />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TopbarPage;

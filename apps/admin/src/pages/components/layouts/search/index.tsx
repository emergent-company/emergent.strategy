import React from "react";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { DocumentationSearchDemo } from "./DocumentationSearchDemo";
import { DrawerSearchDemo } from "./DrawerSearchDemo";
import { FileSearchDemo } from "./FileSearchDemo";
import { InlineSearchDemo } from "./InlineSearchDemo";
import { MinimalSearchDemo } from "./MinimalSearchDemo";
import { ProjectSearchDemo } from "./ProjectSearchDemo";
import { SmartSearchDemo } from "./SmartSearchDemo";
import { SplitSearchDemo } from "./SplitSearchDemo";

const SearchPage = () => {
    return (
        <div>
            <MetaData title="Search - Layouts" />
            <ComponentPageTitle
                label="Layouts"
                title="Search"
                description="Showcasing multiple search interface patterns for modern web applications"
            />
            <p className="text-base-content/60 mt-6 font-medium lg:mt-12">Demos</p>

            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Minimal</div>
                    <div className="flex items-center justify-center p-6">
                        <MinimalSearchDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Split</div>
                    <div className="flex items-center justify-center p-6">
                        <SplitSearchDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Smart</div>
                    <div className="flex items-center justify-center p-6">
                        <SmartSearchDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Project</div>
                    <div className="flex items-center justify-center p-6">
                        <ProjectSearchDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Inline</div>
                    <div className="flex items-center justify-center p-6">
                        <InlineSearchDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">File</div>
                    <div className="flex items-center justify-center p-6">
                        <FileSearchDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Drawer</div>
                    <div className="flex items-center justify-center p-6">
                        <DrawerSearchDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Documentation</div>
                    <div className="flex items-center justify-center p-6">
                        <DocumentationSearchDemo />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SearchPage;

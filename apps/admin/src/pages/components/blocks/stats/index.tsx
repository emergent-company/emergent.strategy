import React from "react";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { CRMStatsDemo } from "./CRMStatsDemo";
import { ChartsStatsDemo } from "./ChartsStatsDemo";
import { EcommerceStatsDemo } from "./EcommerceStatsDemo";
import { FileStatsDemo } from "./FileStatsDemo";
import { GenAIStatsDemo } from "./GenAIStatsDemo";
import { IconCornerStatsDemo } from "./IconCornerStatsDemo";
import { InteractiveStatsDemo } from "./InteractiveStatsDemo";
import { MergedStatsDemo } from "./MergedStatsDemo";
import { MinimalStatsDemo } from "./MinimalStatsDemo";
import { SelectableStatsDemo } from "./SelectableStatsDemo";

const StatsPage = () => {
    return (
        <div>
            <MetaData title="Dashboard Stats - Blocks" />

            <ComponentPageTitle
                label="Blocks"
                title="Dashboard Stats"
                description="Dashboard stats with support for icons, actions, editable fields, filters, and flexible layouts"
            />

            <p className="text-base-content/60 mt-6 font-medium lg:mt-12">Demos</p>

            <div className="mt-6 space-y-6">
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Minimal</div>
                    <div className="p-6">
                        <MinimalStatsDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Charts</div>
                    <div className="p-6">
                        <ChartsStatsDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Icon Corner</div>
                    <div className="p-6">
                        <IconCornerStatsDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Interactive</div>
                    <div className="p-6">
                        <InteractiveStatsDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Selectable</div>
                    <div className="p-6">
                        <SelectableStatsDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Merged</div>
                    <div className="p-6">
                        <MergedStatsDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">File</div>
                    <div className="p-6">
                        <FileStatsDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Ecommerce</div>
                    <div className="p-6">
                        <EcommerceStatsDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">CRM</div>
                    <div className="p-6">
                        <CRMStatsDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Gen AI</div>
                    <div className="p-6">
                        <GenAIStatsDemo />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StatsPage;

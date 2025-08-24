import React from "react";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { AnalyticsTitleDemo } from "./AnalyticsTitleDemo";
import { EcommerceTitleDemo } from "./EcommerceTitleDemo";
import { EditorTitleDemo } from "./EditorTitleDemo";
import { MinimalTitleDemo } from "./MinimalTitleDemo";
import { StepperTitleDemo } from "./StepperTitleDemo";
import { TaskTitleDemo } from "./TaskTitleDemo";
import { TopbarWithTitleDemo } from "./TopbarWithTitleDemo";

const Topbar = (
    <div className="to-base-200/20 text-base-content/25 flex h-24 w-full items-center justify-center bg-linear-to-b from-transparent">
        Topbar
    </div>
);

const Content = (
    <div className="to-base-200/20 text-base-content/25 flex h-32 w-full items-center justify-center bg-linear-to-t from-transparent">
        Content
    </div>
);

const PageTitlePage = () => {
    return (
        <div>
            <MetaData title="Page title - Layouts" />
            <ComponentPageTitle
                label="Layouts"
                title="Page Title"
                description="Flexible page title layouts with support for actions, breadcrumbs, tabs, stats, or progress."
            />

            <p className="text-base-content/60 mt-6 font-medium lg:mt-12">Demos</p>

            <div className="mt-6 space-y-6">
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Minimal</div>
                    {Topbar}
                    <div className="bg-base-100 rounded-box px-4 py-3 shadow">
                        <MinimalTitleDemo />
                    </div>
                    {Content}
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Ecommerce</div>
                    {Topbar}
                    <div className="bg-base-100 rounded-box px-4 py-3 shadow">
                        <EcommerceTitleDemo />
                    </div>
                    {Content}
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Editor</div>
                    {Topbar}
                    <div className="bg-base-100 rounded-box px-4 py-3 shadow">
                        <EditorTitleDemo />
                    </div>
                    {Content}
                </div>

                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Task</div>
                    {Topbar}
                    <div className="bg-base-100 rounded-box px-4 py-3 shadow">
                        <TaskTitleDemo />
                    </div>
                    {Content}
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Stepper</div>
                    {Topbar}
                    <div className="bg-base-100 rounded-box px-4 py-3 shadow">
                        <StepperTitleDemo />
                    </div>
                    {Content}
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Analytics</div>
                    {Topbar}
                    <div className="bg-base-100 rounded-box px-4 py-3 shadow">
                        <AnalyticsTitleDemo />
                    </div>
                    {Content}
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Topbar & Title</div>
                    <div className="bg-base-100 rounded-box shadow">
                        <TopbarWithTitleDemo />
                    </div>
                    {Content}
                </div>
            </div>
        </div>
    );
};

export default PageTitlePage;

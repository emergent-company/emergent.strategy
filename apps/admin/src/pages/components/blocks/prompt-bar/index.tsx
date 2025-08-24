import React from "react";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { AbilityPromptBarDemo } from "./AbilityPromptBarDemo";
import { ActionPromptBarDemo } from "./ActionPromptBarDemo";
import { ManagerPromptBarDemo } from "./ManagerPromptBarDemo";
import { MinimalPromptBarDemo } from "./MinimalPromptBarDemo";
import { ModelPromptBarDemo } from "./ModelPromptBarDemo";
import { QuickPromptBarDemo } from "./QuickPromptBarDemo";

const PromptBarPage = () => {
    return (
        <div>
            <MetaData title="Prompt Bar - Blocks" />

            <ComponentPageTitle
                label="Blocks"
                title="Prompt Bar"
                description="An intelligent bar to manage, edit, and reuse your favorite prompts effortlessly"
            />

            <p className="text-base-content/60 mt-6 font-medium lg:mt-12">Demos</p>

            <div className="mt-6 space-y-6">
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Minimal</div>
                    <div className="flex w-full items-center justify-center p-6 xl:py-12">
                        <MinimalPromptBarDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Action</div>
                    <div className="flex w-full items-center justify-center p-6 xl:py-12">
                        <ActionPromptBarDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Model</div>
                    <div className="flex w-full items-center justify-center p-6 xl:py-12">
                        <ModelPromptBarDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Ability</div>
                    <div className="flex w-full items-center justify-center p-6 xl:py-12">
                        <AbilityPromptBarDemo />
                    </div>
                </div>

                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Manager</div>
                    <div className="flex w-full items-center justify-center p-6 xl:py-12">
                        <ManagerPromptBarDemo />
                    </div>
                </div>
                <div className="card card-border bg-base-100">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Quick</div>
                    <div className="flex w-full items-center justify-center p-6 xl:py-12">
                        <QuickPromptBarDemo />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PromptBarPage;

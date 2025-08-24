import React from "react";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { ProgressWizardDemo } from "./ProgressWizardDemo";
import { StepperWizardDemo } from "./StepperWizardDemo";
import { TabWizardDemo } from "./TabWizardDemo";

const WizardPage = () => {
    return (
        <div>
            <MetaData title="Wizard - Interactions" />
            <ComponentPageTitle
                label="Interactions"
                title="Wizard"
                description="Multi-step form wizards with tab, stepper, and progress layouts for guided user input"
            />
            <p className="text-base-content/60 mt-6 font-medium lg:mt-12">Demos</p>

            <div className="mt-6 space-y-6">
                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 flex items-center gap-2.5 px-5 py-3 font-medium">
                        <span className="iconify lucide--list-ordered size-4.5"></span>
                        Stepper
                    </div>
                    <div className="p-5">
                        <StepperWizardDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 flex items-center gap-2.5 px-5 py-3 font-medium">
                        <span className="iconify lucide--bar-chart size-4.5"></span>
                        Progress
                    </div>
                    <div className="p-5">
                        <ProgressWizardDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 flex items-center gap-2.5 px-5 py-3 font-medium">
                        <span className="iconify lucide--layout-template size-4.5"></span>
                        Tab
                    </div>
                    <div className="p-5">
                        <TabWizardDemo />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WizardPage;

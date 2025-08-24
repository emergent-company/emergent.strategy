import React from "react";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { BothPasswordDemo } from "./BothPasswordDemo";
import { ProgressPasswordDemo } from "./ProgressPasswordDemo";
import { RulesPasswordDemo } from "./RulesPasswordDemo";

const PasswordMeterPage = () => {
    return (
        <div>
            <MetaData title="Password Meter - Interactions" />
            <ComponentPageTitle
                label="Interactions"
                title="Password Meter"
                description="Interactive password strength meter with live rules check and visual progress feedback"
            />
            <p className="text-base-content/60 mt-6 font-medium lg:mt-12">Test your password</p>
            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Rules & Progress</div>
                    <div className="p-6">
                        <BothPasswordDemo />
                    </div>
                </div>
            </div>
            <p className="text-base-content/60 mt-6 font-medium">Demos</p>

            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Rules</div>
                    <div className="p-5">
                        <RulesPasswordDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Progress</div>
                    <div className="p-6">
                        <ProgressPasswordDemo />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PasswordMeterPage;

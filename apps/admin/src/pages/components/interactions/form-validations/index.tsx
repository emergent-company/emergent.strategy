import React from "react";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { CheckboxDemo } from "./CheckboxDemo";
import { EmailDemo } from "./EmailDemo";
import { FormDemo } from "./FormDemo";
import { NumberDemo } from "./NumberDemo";
import { RadioDemo } from "./RadioDemo";
import { RangeDemo } from "./RangeDemo";
import { RatingsDemo } from "./RatingsDemo";
import { SelectDemo } from "./SelectDemo";
import { TextDemo } from "./TextDemo";
import { ToggleDemo } from "./ToggleDemo";

const FormValidationPage = () => {
    return (
        <div>
            <MetaData title="Form Validation - Interactions" />
            <ComponentPageTitle
                label="Interactions"
                title="Form Validation"
                description="Flexible form validation with inputs, checkboxes, radios, toggles, selects, and custom controls"
            />
            <p className="text-base-content/60 mt-6 font-medium lg:mt-12">Demos</p>

            <div className="bg-base-100 card card-border mt-6">
                <div className="bg-base-200/30 flex items-center gap-2.5 px-5 py-3 font-medium">
                    <span className="iconify lucide--form-input size-4.5"></span>
                    Form
                </div>
                <div className="p-5">
                    <FormDemo />
                </div>
            </div>

            <p className="text-base-content/60 mt-6 font-medium">Form Elements</p>
            <div className="mt-6 grid grid-cols-1 gap-6 space-y-6 lg:grid-cols-2 xl:grid-cols-3">
                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 flex items-center gap-2.5 px-5 py-3 font-medium">
                        <span className="iconify lucide--text size-4.5"></span>
                        Text
                    </div>
                    <div className="p-5">
                        <TextDemo />
                    </div>
                </div>

                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 flex items-center gap-2.5 px-5 py-3 font-medium">
                        <span className="iconify lucide--binary size-4.5"></span>
                        Number
                    </div>
                    <div className="p-5">
                        <NumberDemo />
                    </div>
                </div>

                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 flex items-center gap-2.5 px-5 py-3 font-medium">
                        <span className="iconify lucide--mail size-4.5"></span>
                        Email
                    </div>
                    <div className="p-5">
                        <EmailDemo />
                    </div>
                </div>

                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 flex items-center gap-2.5 px-5 py-3 font-medium">
                        <span className="iconify lucide--circle-dot size-4.5"></span>
                        Radio
                    </div>
                    <div className="p-5">
                        <RadioDemo />
                    </div>
                </div>

                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 flex items-center gap-2.5 px-5 py-3 font-medium">
                        <span className="iconify lucide--square-check size-4.5"></span>
                        Checkbox
                    </div>
                    <div className="p-5">
                        <CheckboxDemo />
                    </div>
                </div>

                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 flex items-center gap-2.5 px-5 py-3 font-medium">
                        <span className="iconify lucide--toggle-right size-4.5"></span>
                        Toggle
                    </div>
                    <div className="p-5">
                        <ToggleDemo />
                    </div>
                </div>

                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 flex items-center gap-2.5 px-5 py-3 font-medium">
                        <span className="iconify lucide--diamond size-4.5"></span>
                        Select
                    </div>
                    <div className="p-5">
                        <SelectDemo />
                    </div>
                </div>

                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 flex items-center gap-2.5 px-5 py-3 font-medium">
                        <span className="iconify lucide--settings-2 size-4.5"></span>
                        Range
                    </div>
                    <div className="p-5">
                        <RangeDemo />
                    </div>
                </div>

                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 flex items-center gap-2.5 px-5 py-3 font-medium">
                        <span className="iconify lucide--star size-4.5"></span>
                        Ratings
                    </div>
                    <div className="p-5">
                        <RatingsDemo />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FormValidationPage;

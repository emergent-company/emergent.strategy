import React from "react";
import { Link } from "react-router";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { DisabledDemo } from "./DisabledDemo";
import { EmailInputDemo } from "./EmailInputDemo";
import { GroupDemo } from "./GroupDemo";
import { MultipleDemo } from "./MultipleDemo";
import { RemovableDemo } from "./RemovableDemo";
import { SearchableDemo } from "./SearchableDemo";
import { SimpleDemo } from "./SimpleDemo";
import { TextInputDemo } from "./TextInputDemo";

const SelectPage = () => {
    return (
        <div>
            <ComponentPageTitle
                label="Interactions"
                title="Select"
                description="Feature-rich select and input components with support for groups, search, multiple, and more"
            />
            <MetaData title="Select - Interactions" />
            <div className="bg-base-200/40 rounded-box mt-6 px-5 py-4 lg:mt-12">
                <p className="text-base-content/60 font-medium">Usage guidelines</p>
                <p className="mt-1">
                    <span className="me-1">- Plugin Documentation:</span>
                    <Link to="https://choices-js.github.io/Choices/" target="_blank" className="text-primary">
                        Choices.js
                    </Link>
                </p>
            </div>
            <p className="text-base-content/60 mt-6 font-medium">Demos</p>
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Simple</div>
                    <div className="p-5">
                        <SimpleDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Disabled</div>
                    <div className="p-5">
                        <DisabledDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Group</div>
                    <div className="p-5">
                        <GroupDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Multiple</div>
                    <div className="p-5">
                        <MultipleDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Removable</div>
                    <div className="p-5">
                        <RemovableDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Searchable</div>
                    <div className="p-5">
                        <SearchableDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Text Input</div>
                    <div className="p-5">
                        <TextInputDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Email Input</div>
                    <div className="p-5">
                        <EmailInputDemo />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SelectPage;

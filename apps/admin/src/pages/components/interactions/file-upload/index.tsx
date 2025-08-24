import React from "react";
import { Link } from "react-router";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { CircleDemo } from "./CircleDemo";
import { DisabledDemo } from "./DisabledDemo";
import { ImagePreviewDemo } from "./ImagePreviewDemo";
import { MultipleDemo } from "./MultipleDemo";
import { SimpleDemo } from "./SimpleDemo";

const FileUploadPage = () => {
    return (
        <div>
            <MetaData title="File Upload - Interactions" />
            <ComponentPageTitle
                label="Interactions"
                title="File Upload"
                description="Customizable file upload with image preview, filters, renaming, and avatar selection support"
            />
            <div className="bg-base-200/40 rounded-box mt-6 px-5 py-4 lg:mt-12">
                <p className="text-base-content/60 font-medium">Usage guidelines</p>
                <p className="mt-1">
                    <span className="me-1">- Plugin Documentation:</span>
                    <Link to="https://pqina.nl/filepond/" target="_blank" className="text-primary">
                        Filepond
                    </Link>
                </p>
            </div>
            <p className="text-base-content/60 mt-6 font-medium">Demos</p>
            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Simple</div>
                    <div className="p-6">
                        <SimpleDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Disabled</div>
                    <div className="p-6">
                        <DisabledDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Image Preview</div>
                    <div className="p-6">
                        <ImagePreviewDemo />
                    </div>
                </div>

                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Multiple</div>
                    <div className="p-6">
                        <MultipleDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Avatar Picker</div>
                    <div className="flex items-center justify-center p-6">
                        <CircleDemo />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FileUploadPage;

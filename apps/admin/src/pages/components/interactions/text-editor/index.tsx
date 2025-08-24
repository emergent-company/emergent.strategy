import React from "react";
import { Link } from "react-router";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { BubbleDemo } from "./BubbleDemo";
import { SnowDemo } from "./SnowDemo";

const TextEditorPage = () => {
    return (
        <div>
            <MetaData title="Text Editor - QuillJS" />
            <ComponentPageTitle
                label="Interactions"
                title="Text Editor"
                description="Rich text editor with clean themes, formatting tools, and live editing experience."
            />
            <div className="bg-base-200/40 rounded-box mt-6 px-5 py-4 lg:mt-12">
                <p className="text-base-content/60 font-medium">Usage guidelines</p>
                <p className="mt-1">
                    <span className="me-1">- Plugin Documentation:</span>
                    <Link to="https://quilljs.com/" target="_blank" className="text-primary">
                        Quill
                    </Link>
                </p>
            </div>
            <p className="text-base-content/60 mt-6 font-medium">Demos</p>
            <div className="mt-6 space-y-6">
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Snow Theme</div>
                    <div className="p-6">
                        <SnowDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border">
                    <div className="bg-base-200/30 px-5 py-3 font-medium">Bubble Theme</div>
                    <div className="p-3">
                        <BubbleDemo />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TextEditorPage;

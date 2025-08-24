import React from "react";

import { ComponentPageTitle } from "@/components/ComponentPageTitle";
import { MetaData } from "@/components/MetaData";

import { SimpleDemo } from "./SimpleDemo";
import { TitleDemo } from "./TitleDemo";
import { UploadDemo } from "./UploadDemo";

const FABPage = () => {
    return (
        <div>
            <MetaData title="FAB - Interactions" />
            <ComponentPageTitle
                label="Interactions"
                title="FAB"
                description="Floating action button with icons, labels, and quick access to key actions"
            />
            <p className="text-base-content/60 mt-6 font-medium lg:mt-12">Demos</p>

            <div className="mt-6 grid grid-cols-1 gap-6 space-y-6 md:grid-cols-2 xl:grid-cols-3">
                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Simple</div>
                    <div className="p-6">
                        <SimpleDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Title</div>
                    <div className="p-6">
                        <TitleDemo />
                    </div>
                </div>
                <div className="bg-base-100 card card-border h-fit">
                    <div className="bg-base-200/30 rounded-t-box px-5 py-3 font-medium">Upload Menu</div>
                    <div className="p-6">
                        <UploadDemo />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FABPage;

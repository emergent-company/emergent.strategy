import React from "react";

import { MetaData } from "@/components/MetaData";
import { PageTitle } from "@/components/PageTitle";

import { ErrorActionDemo } from "./ErrorActionDemo";
import { FileDeletedActionDemo } from "./FileDeletedActionDemo";
import { FileRenameActionDemo } from "./FileRenameActionDemo";
import { FileSharedActionDemo } from "./FileSharedActionDemo";
import { FileUploadedActionDemo } from "./FileUploadedActionDemo";
import { FolderCreatedActionDemo } from "./FolderCreatedActionDemo";
import { InProcessActionDemo } from "./InProcessActionDemo";
import { InQueueActionDemo } from "./InQueueActionDemo";
import { InputToolbar } from "./InputToolbar";
import { NeedConfirmationActionDemo } from "./NeedConfirmationActionDemo";
import { PermissionUpdatedActionDemo } from "./PermissionUpdatedActionDemo";
import { StorageStatusActionDemo } from "./StorageStatusActionDemo";

const AgenticFilePage = () => {
    return (
        <>
            <MetaData title="Agentic Storage" />
            <PageTitle title="Agentic Storage" items={[{ label: "Agentic Hub" }, { label: "Storage", active: true }]} />
            <div className="mt-6 flex items-center justify-center">
                <InputToolbar />
            </div>
            <div className="mt-6 xl:mt-8">
                <p className="text-base-content/60 font-medium">Examples</p>
                <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    <InProcessActionDemo />
                    <InQueueActionDemo />
                    <NeedConfirmationActionDemo />
                    <ErrorActionDemo />
                </div>
                <p className="text-base-content/60 mt-6 font-medium">Tasks</p>
                <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    <FileSharedActionDemo />
                    <FileUploadedActionDemo />
                    <StorageStatusActionDemo />
                    <FolderCreatedActionDemo />
                    <FileRenameActionDemo />
                    <PermissionUpdatedActionDemo />
                    <FileDeletedActionDemo />
                    <div className="card bg-base-100 text-base-content/40 flex items-center justify-center py-6 text-lg font-medium shadow">
                        More examples coming soon!
                    </div>
                </div>
            </div>
        </>
    );
};

export default AgenticFilePage;

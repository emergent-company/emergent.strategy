import { MetaData } from "@/components/MetaData";

import { FileTable } from "./components/FileTable";
import { FolderList } from "./components/FolderList";
import { StatList } from "./components/StatList";
import { StorageOverview } from "./components/StorageOverview";
import { UploadButton } from "./components/UploadButton";

const FileApp = () => {
    return (
        <>
            <MetaData title="File Manager App" />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 2xl:grid-cols-4">
                <div className="col-span-1 xl:col-span-2 2xl:col-span-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium">File Manager</h3>
                        <div className="inline-flex items-center gap-3">
                            <div className="drawer drawer-end">
                                <input
                                    id="apps-file-overview-drawer"
                                    className="drawer-toggle"
                                    type="checkbox"
                                    aria-label="File Overview Trigger"
                                />
                                <div className="drawer-content">
                                    <label
                                        htmlFor="apps-file-overview-drawer"
                                        className="btn drawer-button btn-sm btn-ghost border-base-300 flex xl:hidden">
                                        <span className="iconify lucide--folder-kanban size-4" />
                                    </label>
                                </div>
                                <div className="drawer-side z-[50]">
                                    <label
                                        htmlFor="apps-file-overview-drawer"
                                        aria-label="close sidebar"
                                        className="drawer-overlay"></label>
                                    <div className="w-72">
                                        <StorageOverview />
                                    </div>
                                </div>
                            </div>
                            <UploadButton />
                        </div>
                    </div>
                    <div className="mt-6">
                        <StatList />
                    </div>
                    <h3 className="mt-6 font-medium">Folders</h3>
                    <div className="mt-3">
                        <FolderList />
                    </div>
                    <h3 className="mt-6 font-medium">Your Files</h3>
                    <div className="mt-3">
                        <FileTable />
                    </div>
                </div>
                <div className="hidden xl:col-span-1 xl:block 2xl:col-span-1">
                    <StorageOverview />
                </div>
            </div>
        </>
    );
};

export default FileApp;

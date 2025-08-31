import { MetaData } from "@/components/MetaData";
import { Icon } from "@/components/ui/Icon";

import { FileTable } from "./components/FileTable";
import { FolderList } from "./components/FolderList";
import { StatList } from "./components/StatList";
import { StorageOverview } from "./components/StorageOverview";
import { UploadButton } from "./components/UploadButton";

const FileApp = () => {
    return (
        <>
            <MetaData title="File Manager App" />
            <div className="gap-6 grid grid-cols-1 2xl:grid-cols-4 xl:grid-cols-3">
                <div className="col-span-1 2xl:col-span-3 xl:col-span-2">
                    <div className="flex justify-between items-center">
                        <h3 className="font-medium text-lg">File Manager</h3>
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
                                        className="xl:hidden flex border-base-300 btn drawer-button btn-sm btn-ghost">
                                        <Icon icon="lucide--folder-kanban" className="size-4" aria-hidden />
                                    </label>
                                </div>
                                <div className="z-[50] drawer-side">
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
                <div className="hidden xl:block 2xl:col-span-1 xl:col-span-1">
                    <StorageOverview />
                </div>
            </div>
        </>
    );
};

export default FileApp;

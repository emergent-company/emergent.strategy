import { Icon } from "@/components/ui/Icon";
import { FileTableRow, IFileTableRow } from "./FileTableRow";

const files: IFileTableRow[] = [
    {
        icon: "lucide--video",
        name: "Latest Video",
        size: "5.1 GiB",
        date: "26 Dec 2024",
        owner: "Denish",
        sharedWith: <span className="text-base-content/60">3 members</span>,
    },
    {
        icon: "lucide--file-text",
        name: "Company Documents",
        size: "7.8 MiB",
        date: "25 Dec 2024",
        owner: "Company",
        sharedWith: (
            <span className="flex items-center gap-2 text-error">
                <Icon icon="lucide--shield" className="size-4" />
                Private
            </span>
        ),
    },
    {
        icon: "lucide--figma",
        name: "Figma Design",
        size: "1.4 MiB",
        date: "23 Dec 2024",
        owner: "Turkes Duis",
        sharedWith: <span className="text-base-content/60">7 members</span>,
    },
    {
        icon: "lucide--music",
        name: "Top Music",
        size: "4.8 MiB",
        date: "19 Dec 2024",
        owner: "Me",
        sharedWith: (
            <span className="flex items-center gap-2 text-success">
                <Icon icon="lucide--globe" className="size-4" />
                Public
            </span>
        ),
    },
    {
        icon: "lucide--file-spreadsheet",
        name: "Office Sheet",
        size: "56 KiB",
        date: "11 Dec 2024",
        owner: "Mr. Boss",
        sharedWith: <span className="text-base-content/60">2 members</span>,
    },
    {
        icon: "lucide--message-circle-dashed",
        name: "Chat Backup",
        size: "252 KiB",
        date: "12 Nov 2024",
        owner: "Withden",
        sharedWith: (
            <span className="flex items-center gap-2 text-error">
                <Icon icon="lucide--shield" className="size-4" />
                Private
            </span>
        ),
    },
];

export const FileTable = () => {
    return (
        <div className="bg-base-100 card-border card">
            <div className="p-0 card-body">
                <div className="flex justify-between items-center gap-3 px-5 pt-5">
                    <div className="inline-flex items-center gap-3">
                        <div className="dropdown-bottom dropdown dropdown-start">
                            <div
                                tabIndex={0}
                                role="button"
                                className="border-base-300 btn btn-ghost btn-square btn-sm"
                                aria-label="Add">
                                <Icon icon="lucide--plus" className="size-4" />
                            </div>
                            <div tabIndex={0} className="bg-base-100 shadow mt-2 rounded-box w-52 dropdown-content">
                                <ul className="p-1.5 w-full menu">
                                    <li>
                                        <div>
                                            <Icon icon="lucide--folder" className="size-4" />
                                            New Folder
                                        </div>
                                    </li>
                                </ul>
                                <hr className="border-base-300" />
                                <ul className="p-1.5 w-full menu">
                                    <li>
                                        <div>
                                            <Icon icon="lucide--folder-up" className="size-4" />
                                            Upload Folder
                                        </div>
                                    </li>
                                    <li>
                                        <div>
                                            <Icon icon="lucide--file-up" className="size-4" />
                                            Upload File
                                        </div>
                                    </li>
                                </ul>
                                <hr className="border-base-300" />
                                <ul className="p-1.5 w-full menu">
                                    <li>
                                        <div>
                                            <Icon icon="lucide--file-text" className="size-4" />
                                            Create Document
                                        </div>
                                    </li>
                                    <li>
                                        <div>
                                            <Icon icon="lucide--file-spreadsheet" className="size-4" />
                                            Create Sheet
                                        </div>
                                    </li>
                                </ul>
                            </div>
                        </div>
                        <button className="hidden sm:flex border-base-300 btn-outline btn btn-sm">
                            <Icon icon="lucide--folder-git-2" className="size-4" />
                            <span>Organize</span>
                        </button>
                    </div>

                    <div className="inline-flex items-center gap-3">
                        <label className="input input-sm">
                            <Icon icon="lucide--search" className="size-4 text-base-content/80" />
                            <input
                                type="search"
                                className="grow"
                                placeholder="Search along files"
                                aria-label="Search chat"
                            />
                        </label>
                        <div className="hidden sm:block">
                            <select className="w-32 select-sm select" defaultValue="" aria-label="File type">
                                <option value="" disabled>
                                    File type
                                </option>
                                <option>Images</option>
                                <option>Videos</option>
                                <option>Documents</option>
                                <option>Archives</option>
                                <option>Other</option>
                            </select>
                        </div>
                        <div className="inline-flex items-center gap-1">
                            <button className="btn btn-sm btn-ghost btn-square" aria-label="Grid">
                                <Icon icon="lucide--grid-2x2" className="size-4" />
                            </button>
                            <button className="btn btn-sm btn-soft btn-square" aria-label="List">
                                <Icon icon="lucide--list" className="size-4" />
                            </button>
                        </div>
                    </div>
                </div>
                <div className="overflow-auto">
                    <table className="table mt-2 rounded-box">
                        <thead>
                            <tr>
                                <th>
                                    <input
                                        className="checkbox checkbox-sm"
                                        aria-label="Checkbox example"
                                        type="checkbox"
                                    />
                                </th>
                                <th>Name</th>
                                <th>Size</th>
                                <th>Created At</th>
                                <th>Owner</th>
                                <th>Shared With</th>
                                <th>Action</th>
                            </tr>
                        </thead>

                        <tbody>
                            {files.map((item, index) => (
                                <FileTableRow key={index} {...item} />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

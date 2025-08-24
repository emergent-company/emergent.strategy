import { Link } from "react-router";

export const EditorTitleDemo = () => {
    return (
        <div className="w-full">
            <div className="breadcrumbs text-sm">
                <ul>
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--layout-dashboard mr-1 size-4"></span>
                            Dashboard
                        </Link>
                    </li>
                    <li>
                        <Link to="#">
                            <span className="iconify lucide--package mr-1 size-4"></span>
                            Tools
                        </Link>
                    </li>
                    <li>Builder</li>
                </ul>
            </div>

            <div className="mt-1 flex items-end justify-between gap-3">
                <div>
                    <p className="font-medium sm:text-lg">Smart Tool Builder</p>
                    <div className="text-base-content/60 mt-0.5 flex items-center gap-3 text-sm">
                        <div className="flex items-center gap-1">
                            <span className="iconify lucide--settings size-3.5"></span>
                            <span>Type: Custom Workflow</span>
                        </div>
                        <div className="flex items-center gap-1 max-md:hidden">
                            <span className="iconify lucide--calendar-clock size-3.5"></span>
                            <span>Created on {new Date().toDateString()}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button className="btn btn-primary btn-sm max-md:hidden">Save Changes</button>
                    <button className="btn btn-outline btn-sm border-base-300 max-md:hidden">Preview Tool</button>
                    <button className="btn btn-outline btn-sm border-base-300 btn-square" aria-label="More options">
                        <span className="iconify lucide--more-vertical size-4"></span>
                    </button>
                </div>
            </div>
        </div>
    );
};

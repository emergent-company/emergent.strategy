import { Link } from "react-router";

export const MinimalTitleDemo = () => {
    return (
        <div className="flex w-full items-center justify-between gap-3">
            <p className="font-medium">Create New Tool</p>
            <div className="text-base-content/80 flex items-center gap-3 text-sm">
                <Link to="#" aria-label="Home">
                    <span className="iconify lucide--home block size-4"></span>
                </Link>
                <p>/</p>
                <Link to="#" className="inline-flex items-center gap-1">
                    <span className="iconify lucide--package size-4"></span>
                    <span className="max-sm:hidden">Tools</span>
                </Link>
                <p>/</p>
                <span className="text-base-content font-medium">Create</span>
            </div>
        </div>
    );
};

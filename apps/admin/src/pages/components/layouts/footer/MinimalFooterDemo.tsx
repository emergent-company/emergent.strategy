export const MinimalFooterDemo = () => {
    return (
        <div className="flex w-full items-center justify-center px-4 py-3">
            <span className="text-base-content/80 text-sm">
                © {new Date().getFullYear()} Nexus. All rights reserved.
            </span>
        </div>
    );
};

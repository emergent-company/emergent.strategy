export interface ImportProgressProps {
    syncing: boolean;
}

export function ImportProgress({ syncing }: ImportProgressProps) {
    return (
        <div className="flex flex-col justify-center items-center py-16">
            <span className="mb-6 text-primary loading loading-spinner loading-lg"></span>
            <p className="mb-2 font-semibold text-lg">
                {syncing ? 'Importing tasks...' : 'Preparing import...'}
            </p>
            <p className="max-w-md text-sm text-base-content/60 text-center">
                This may take a few moments depending on the number of tasks being imported.
                Please do not close this window.
            </p>
        </div>
    );
}

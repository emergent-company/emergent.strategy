export interface ImportConfig {
    includeArchived?: boolean;
    batchSize?: number;
}

export interface ImportConfigFormProps {
    config: ImportConfig;
    onChange: (config: ImportConfig) => void;
}

export function ImportConfigForm({ config, onChange }: ImportConfigFormProps) {
    const handleIncludeArchivedChange = (checked: boolean) => {
        onChange({ ...config, includeArchived: checked });
    };

    const handleBatchSizeChange = (value: string) => {
        const batchSize = parseInt(value, 10);
        if (!isNaN(batchSize) && batchSize >= 10 && batchSize <= 1000) {
            onChange({ ...config, batchSize });
        }
    };

    return (
        <div className="space-y-6 py-4">
            <div className="form-control">
                <label className="justify-start gap-4 cursor-pointer label">
                    <input
                        type="checkbox"
                        className="checkbox checkbox-primary"
                        checked={config.includeArchived ?? false}
                        onChange={e => handleIncludeArchivedChange(e.target.checked)}
                    />
                    <div className="flex-1">
                        <span className="block mb-1 font-semibold label-text">
                            Include completed/archived tasks
                        </span>
                        <span className="label-text-alt text-base-content/60">
                            Import tasks that have been marked as completed or archived in ClickUp
                        </span>
                    </div>
                </label>
            </div>

            <div className="form-control">
                <label className="label">
                    <span className="font-semibold label-text">
                        Batch size
                    </span>
                    <span className="label-text-alt text-base-content/60">
                        {config.batchSize ?? 100} tasks per request
                    </span>
                </label>
                <input
                    type="range"
                    min={10}
                    max={1000}
                    step={10}
                    value={config.batchSize ?? 100}
                    className="range range-primary"
                    onChange={e => handleBatchSizeChange(e.target.value)}
                />
                <div className="flex justify-between mt-1 text-xs text-base-content/60">
                    <span>10</span>
                    <span>500</span>
                    <span>1000</span>
                </div>
                <div className="label">
                    <span className="label-text-alt text-base-content/60">
                        Larger batch sizes are faster but may hit rate limits. Recommended: 100
                    </span>
                </div>
            </div>

            <div className="alert alert-info">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current w-6 h-6 shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <div className="text-sm">
                    <div className="mb-1 font-semibold">Import Settings</div>
                    <div className="opacity-80 text-xs">
                        These settings control how tasks are imported from ClickUp.
                        You can modify these options during each sync operation.
                    </div>
                </div>
            </div>
        </div>
    );
}

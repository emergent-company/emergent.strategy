export type ITasksTableRow = {
    icon: string;
    name: string;
    status: "in_progress" | "on_hold" | "done";
    time: string;
};

export const TasksTableRow = ({ icon, name, status, time }: ITasksTableRow) => {
    return (
        <tr>
            <td className="flex items-center space-x-3 truncate">
                <div className="bg-base-200 rounded-box p-2">
                    <span className={`iconify ${icon} block size-4`}></span>
                </div>
                <p>{name}</p>
            </td>

            <td>
                <div className="flex items-center gap-2">
                    {status == "in_progress" && (
                        <>
                            <div className="status status-info"></div>
                            In Progress
                        </>
                    )}
                    {status == "on_hold" && (
                        <>
                            <div className="status status-warning"></div>
                            On Hold
                        </>
                    )}
                    {status == "done" && (
                        <>
                            <div className="status status-success"></div>
                            Done
                        </>
                    )}
                </div>
            </td>
            <td>
                <div className="text-base-content/80 inline-flex items-center gap-1 text-sm">
                    <span className="iconify lucide--clock size-3.5"></span>
                    {time}
                </div>
            </td>
            <td>
                <button aria-label="Show product" className="btn btn-circle btn-ghost btn-sm">
                    <span className="iconify lucide--eye text-base-content/80 size-4" />
                </button>
            </td>
        </tr>
    );
};

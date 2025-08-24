import { ITasksTableRow, TasksTableRow } from "./TasksTableRow";

const tasks: ITasksTableRow[] = [
    {
        icon: "lucide--settings",
        name: "Model Fine-Tuning",
        status: "in_progress",
        time: "2h 30m",
    },
    {
        icon: "lucide--upload-cloud",
        name: "Dataset Processing",
        status: "on_hold",
        time: "1h 15m",
    },
    {
        icon: "lucide--wand",
        name: "Generating AI Art",
        status: "done",
        time: "45m",
    },
    {
        icon: "lucide--cpu",
        name: "Running Inference",
        status: "in_progress",
        time: "3h 10m",
    },
];

export const RecentTasksCard = () => {
    return (
        <div aria-label="Card" className="card bg-base-100 shadow">
            <div className="card-body p-0">
                <div className="flex items-center gap-3 px-5 pt-5">
                    <span className="iconify lucide--list-check size-4.5" />
                    <span className="font-medium">Recent Generations</span>
                    <button className="btn btn-outline border-base-300 max-sm:btn-square btn-sm ms-auto">
                        <span className="iconify lucide--file-text size-3.5" />
                        <span className="max-sm:hidden">Export</span>
                    </button>
                </div>
                <div className="mt-2 overflow-auto">
                    <table className="table *:text-nowrap">
                        <thead>
                            <tr>
                                <th>Task</th>
                                <th>Status</th>
                                <th>Duration</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map((task, index) => (
                                <TasksTableRow {...task} key={index} />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

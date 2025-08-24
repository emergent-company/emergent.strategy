export const TaskTitleDemo = () => {
    return (
        <div className="flex w-full items-center justify-between gap-3">
            <div>
                <p className="text-lg font-medium">Today’s Schedule</p>
                <p className="text-sm">
                    <span className="text-error">2 due</span>,<span className="text-primary"> 4 in progress</span>,
                    <span className="text-success"> 7 done</span>
                </p>
            </div>

            <div className="flex items-center gap-3">
                <button className="btn btn-outline btn-sm border-base-300 max-md:btn-square gap-2">
                    <span className="iconify lucide--calendar-clock size-4"></span>
                    <span className="max-md:hidden">Sync with Calendar</span>
                </button>
                <button className="btn btn-primary btn-sm max-md:btn-square gap-2">
                    <span className="iconify lucide--plus size-4"></span>
                    <span className="max-md:hidden">New Event</span>
                </button>
            </div>
        </div>
    );
};

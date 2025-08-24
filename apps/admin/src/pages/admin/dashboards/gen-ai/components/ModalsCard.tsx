export const ModalsCard = () => {
    return (
        <div className="card bg-base-100 shadow">
            <div className="p-5">
                <div className="flex items-center gap-3">
                    <span className="iconify lucide--brain-circuit text-base-content/80 size-4.5"></span>
                    <p className="grow font-medium">Modals</p>
                    <button className="btn btn-ghost btn-xs btn-circle">
                        <span className="iconify lucide--settings-2 size-4"></span>
                    </button>
                </div>
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <div className="group flex cursor-pointer items-center gap-3">
                        <div className="border-base-300 group-hover:bg-base-200 flex size-9 items-center justify-center rounded-lg border border-dashed transition-all">
                            <span className="iconify lucide--plus"></span>
                        </div>
                        <p className="leading-none font-medium">Add Modal</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="bg-primary/10 grid size-9 place-items-center rounded-lg">
                            <div className="mask mask-hexagon-2 bg-primary/30 size-5"></div>
                        </div>
                        <div>
                            <p className="leading-none font-medium">NeuraX-7</p>
                            <p className="text-base-content/60 text-sm">99k users</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="bg-secondary/10 grid size-9 place-items-center rounded-lg">
                            <div className="mask mask-diamond bg-secondary/30 size-5"></div>
                        </div>
                        <div>
                            <p className="leading-none font-medium">SynthaMind-5</p>
                            <p className="text-base-content/60 text-sm">120k users</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="bg-success/10 grid size-9 place-items-center rounded-lg">
                            <div className="mask mask-pentagon bg-success/30 size-5"></div>
                        </div>
                        <div>
                            <p className="leading-none font-medium">QuantumVision-X</p>
                            <p className="text-base-content/60 text-sm">85k users</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

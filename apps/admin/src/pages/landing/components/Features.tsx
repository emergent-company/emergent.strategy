import { Icon } from "@/components/ui/Icon";
const features = [
    {
        icon: "lucide--layers",
        title: "Framework Flexibility",
        description: "Use across popular stacks with clean, adaptable structure for rapid prototyping",
        iconClass: "text-blue-500 bg-blue-500/5",
        cardClass: "hover:border-blue-500/40 hover:bg-blue-500/5",
    },
    {
        icon: "lucide--monitor-dot",
        title: "Dashboard View",
        description: "Includes a polished admin layout with sections for stats, content, and user activity",
        iconClass: "text-violet-500 bg-violet-500/5",
        cardClass: "hover:border-violet-500/40 hover:bg-violet-500/5",
    },
    {
        icon: "lucide--package",
        title: "Design-Ready UI",
        description: "Speed up design flow with pre-built elements like buttons, tables, and forms",
        iconClass: "text-cyan-600 bg-cyan-600/5",
        cardClass: "hover:border-cyan-600/40 hover:bg-cyan-600/5",
    },
    {
        icon: "lucide--line-chart",
        title: "Visual Chart Blocks",
        description: "Sketch trends and metrics using built-in chart layouts for fast mockups",
        iconClass: "text-fuchsia-500 bg-fuchsia-500/5",
        cardClass: "hover:border-fuchsia-500/40 hover:bg-fuchsia-500/5",
    },
    {
        icon: "lucide--wand-sparkles",
        title: "LLM-Ready Support",
        description: "Comes with prompt files for teams exploring text-generation workflows",
        iconClass: "text-orange-400 bg-orange-500/5",
        cardClass: "hover:border-orange-400/40 hover:bg-orange-400/5",
    },
    {
        icon: "lucide--clock",
        title: "Quick Start Setup",
        description: "Well-structured layout helps teams kick off designs without starting from scratch",
        iconClass: "text-teal-500 bg-teal-500/5",
        cardClass: "hover:border-teal-500/40 hover:bg-teal-500/5",
    },
    {
        icon: "lucide--monitor-smartphone",
        title: "Adaptive by Design",
        description: "Built to look great on every device, with theme options that fit any brand or user preference",
        iconClass: "text-blue-500 bg-blue-500/5",
        cardClass: "hover:border-blue-500/40 hover:bg-blue-500/5",
    },
    {
        icon: "lucide--pencil-line",
        title: "Flexible Structure",
        description: "Easy to tweak, rearrange, or build on top—ideal for teams that need room to grow",
        iconClass: "text-violet-500 bg-violet-500/5",
        cardClass: "hover:border-violet-500/40 hover:bg-violet-500/5",
    },
] as const;

export const Features = () => {
    return (
        <div className="py-8 md:py-12 2xl:py-24 xl:py-16 container">
            <div className="text-center">
                <div className="inline-flex items-center bg-indigo-500/5 p-2 border border-indigo-500/10 rounded-box">
                    <Icon icon="lucide--wand-2" className="size-5 text-indigo-600" ariaLabel="Magic" />
                </div>
                <p id="fade-in" className="mt-4 font-semibold text-2xl sm:text-3xl custom-fade-in">
                    Designed for Impact
                </p>
                <p className="inline-block mt-3 max-w-lg max-sm:text-sm text-base-content/70">
                    From layouts to interactions, every detail is built to deliver clarity, speed, and a seamless user
                    experience.
                </p>
            </div>
            <div className="gap-4 2xl:gap-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 mt-8 2xl:mt-24 xl:mt-16">
                {features.map((feature, index) => {
                    return (
                        <div
                            className={`card border-base-300 cursor-pointer border border-dashed transition-all duration-300 ${feature.cardClass}`}
                            key={index}>
                            <div className="card-body">
                                <div>
                                    <div className={`inline-flex items-center p-2 ${feature.iconClass} rounded`}>
                                        <Icon icon={feature.icon} className="size-6" aria-hidden />
                                    </div>
                                    <p className="mt-3 font-medium text-lg">{feature.title}</p>
                                    <p className="mt-0.5 overflow-ellipsis text-sm text-base-content/80 line-clamp-2">
                                        {feature.description}
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

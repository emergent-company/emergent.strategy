import { Icon } from "@/components/atoms/Icon";
import { IconBadge, IconBadgeColor } from "@/components/molecules/IconBadge/IconBadge";

// Audit remediation: replaced hard-coded Tailwind palette color utilities with semantic IconBadge usage.
// If marketing requires more distinct hues simultaneously, extend daisyUI theme tokens instead of reintroducing palette classes.

interface FeatureItem {
    icon: string;
    title: string;
    description: string;
    color: IconBadgeColor; // semantic color
}

const features: FeatureItem[] = [
    { icon: "lucide--layers", title: "Framework Flexibility", description: "Use across popular stacks with clean, adaptable structure for rapid prototyping", color: "info" },
    { icon: "lucide--monitor-dot", title: "Dashboard View", description: "Includes a polished admin layout with sections for stats, content, and user activity", color: "accent" },
    { icon: "lucide--package", title: "Design-Ready UI", description: "Speed up design flow with pre-built elements like buttons, tables, and forms", color: "primary" },
    { icon: "lucide--line-chart", title: "Visual Chart Blocks", description: "Sketch trends and metrics using built-in chart layouts for fast mockups", color: "warning" },
    { icon: "lucide--wand-sparkles", title: "LLM-Ready Support", description: "Comes with prompt files for teams exploring text-generation workflows", color: "secondary" },
    { icon: "lucide--clock", title: "Quick Start Setup", description: "Well-structured layout helps teams kick off designs without starting from scratch", color: "success" },
    { icon: "lucide--monitor-smartphone", title: "Adaptive by Design", description: "Built to look great on every device, with theme options that fit any brand or user preference", color: "info" },
    { icon: "lucide--pencil-line", title: "Flexible Structure", description: "Easy to tweak, rearrange, or build on top—ideal for teams that need room to grow", color: "accent" },
];

export const Features = () => {
    return (
        <div className="py-8 md:py-12 2xl:py-24 xl:py-16 container">
            <div className="text-center">
                <IconBadge icon="lucide--wand-2" color="primary" aria-label="Magic" />
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
                            className="hover:bg-base-200/40 border border-base-300 hover:border-base-300/60 border-dashed transition-all duration-300 cursor-pointer card"
                            key={index}
                        >
                            <div className="card-body">
                                <div>
                                    <IconBadge icon={feature.icon} color={feature.color} />
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

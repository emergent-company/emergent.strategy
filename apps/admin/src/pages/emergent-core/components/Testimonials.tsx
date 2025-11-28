const testimonials = [
    {
        image: "/images/avatars/1.png",
        name: "Sarah L.",
        comments:
            "This SaaS template made our launch effortless. Clean design, powerful features, and easy customization!",
        company: "FlowTech",
        position: "Operations Manager",
        location: "San Francisco, USA",
    },
    {
        image: "/images/avatars/2.png",
        name: "David R.",
        comments: "A complete game-changer! The pre-built UI components saved us weeks of development time.",
        company: "SmartBiz",
        position: "CEO",
        location: "London, UK",
    },
];

const stats = [
    {
        icon: "lucide--users",
        title: "Total Users",
        number: "10,000+",
        description: "People rely on our automation every day.",
        iconClass: "text-primary bg-primary/10",
    },
    {
        icon: "lucide--zap",
        title: "Workflows",
        number: "1M+",
        description: "Seamlessly executed tasks without manual effort.",
        iconClass: "text-orange-500 bg-orange-500/10",
    },
    {
        icon: "lucide--building",
        title: "Teams Empowered",
        number: "5,000+",
        description: "Businesses using automation to boost productivity.",
        iconClass: "text-success bg-success/10",
    },
    {
        icon: "lucide--clock",
        title: "Hours Saved",
        number: "100K+",
        description: "Time saved by automating repetitive tasks.",
        iconClass: "text-secondary bg-secondary/10",
    },
];

export const Testimonials = () => {
    return (
        <div className="group/section container scroll-mt-12 py-8 md:py-12 lg:py-16 2xl:py-28" id="testimonials">
            <div className="flex items-center justify-center gap-1.5">
                <div className="bg-primary/80 h-4 w-0.5 translate-x-1.5 rounded-full opacity-0 transition-all group-hover/section:translate-x-0 group-hover/section:opacity-100" />
                <p className="text-base-content/60 group-hover/section:text-primary font-mono text-sm font-medium transition-all">
                    Success Stories
                </p>
                <div className="bg-primary/80 h-4 w-0.5 -translate-x-1.5 rounded-full opacity-0 transition-all group-hover/section:translate-x-0 group-hover/section:opacity-100" />
            </div>
            <p className="mt-2 text-center text-2xl font-semibold 2xl:text-3xl">
                Trusted by Innovators, Loved by Teams
            </p>
            <div className="mt-2 flex justify-center text-center">
                <p className="text-base-content/80 max-w-lg">
                    See how businesses streamline their workflows, save time, and boost efficiency with our automation
                    platform
                </p>
            </div>
            <div className="divide-base-300 mt-8 grid gap-12 md:mt-12 lg:mt-16 lg:grid-cols-2 2xl:mt-24">
                <div className="grid grid-cols-2 gap-y-16">
                    {stats.map((stat, index) => (
                        <div className="text-center" key={index}>
                            <div className={`bg-base-200 inline-block rounded-full p-3 ${stat.iconClass}`}>
                                <span className={`iconify ${stat.icon} block size-6`}></span>
                            </div>
                            <p className="mt-1 font-medium">{stat.title}</p>
                            <p className="mt-1 text-2xl font-semibold">{stat.number}</p>
                        </div>
                    ))}
                </div>
                <div className="">
                    <div className="flex items-center justify-center gap-1">
                        <span className="iconify lucide--star size-9 text-orange-600/30"></span>
                        <span className="iconify lucide--star size-9 text-orange-600/30"></span>
                        <span className="iconify lucide--star size-9 text-orange-600/30"></span>
                        <span className="iconify lucide--star size-9 text-orange-600/30"></span>
                        <span className="iconify lucide--star size-9 text-orange-600/30"></span>
                    </div>
                    <div className="mt-12 grid gap-6 max-sm:gap-16 sm:grid-cols-2">
                        {testimonials.map((testimonial, index) => (
                            <div key={index} className="bg-base-100 card group relative p-1 shadow">
                                <img
                                    src={testimonial.image}
                                    className="bg-base-200/40 border-base-100 absolute start-1/2 -top-11 z-1 size-14 -translate-x-1/2 rounded-full border-3 p-1 shadow-xs"
                                    alt="Avatar"
                                />
                                <div className="bg-neutral/4 rounded-box relative p-4 text-center transition-all">
                                    <p className="font-medium">{testimonial.name}</p>
                                    <p className="text-base-content/80 text-sm leading-none">{testimonial.position}</p>
                                </div>
                                <div className="p-4">
                                    <p className="line-clamp-3 text-sm">{testimonial.comments}</p>
                                    <div className="mt-5 flex items-center gap-2">
                                        <span className="iconify lucide--building size-4"></span>
                                        <span className="text-sm">{testimonial.company}</span>
                                    </div>
                                    <div className="mt-1 flex items-center gap-2">
                                        <span className="iconify lucide--map-pin size-4"></span>
                                        <span className="text-sm">{testimonial.location}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

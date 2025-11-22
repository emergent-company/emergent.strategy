import { Variants, motion } from "motion/react";

const data = [
    {
        title: "HubSpot",
        description: "Sync customer data and track interactions effortlessly to improve sales and support",
        category: "CRM",
        image: "/images/brand-logo/hubspot.svg",
    },
    {
        title: "Shopify",
        description: "Automatically update inventory, process orders, and send customer notifications",
        category: "E-commerce",
        image: "/images/brand-logo/shopify.svg",
    },
    {
        title: "Zapier",
        description: "Connect with 5,000+ apps to automate repetitive tasks and streamline workflows effortlessly",
        category: "Automation",
        image: "/images/brand-logo/zapier.svg",
    },
    {
        title: "Stripe",
        description: "Automate invoicing, payments, and subscription billing with seamless Stripe integration",
        category: "Payment",
        image: "/images/brand-logo/stripe.svg",
    },
    {
        title: "Slack",
        description: "Send instant updates to your team, keeping everyone aligned without switching apps",
        category: "Communication",
        image: "/images/brand-logo/slack.svg",
    },
    {
        title: "Google Drive",
        description: "Automatically store and organize important documents, ensuring easy access whenever needed",
        category: "Storage",
        image: "/images/brand-logo/g-drive.svg",
    },
];

const containerVariants = {
    hidden: { opacity: 1 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.2 },
    },
};

const itemVariants: Variants = {
    hidden: (i) => ({
        opacity: 0,
        x: i % 3 === 0 ? -50 : i % 3 === 2 ? 50 : 0,
        y: 50,
    }),
    visible: {
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
        transition: { type: "spring", stiffness: 100, damping: 12, duration: 0.8 },
    },
};

export const Integrations = () => {
    return (
        <div className="group/section container overflow-hidden py-8 md:py-12 lg:py-16 2xl:py-28">
            <div className="flex items-center justify-center gap-1.5">
                <div className="bg-primary/80 h-4 w-0.5 translate-x-1.5 rounded-full opacity-0 transition-all group-hover/section:translate-x-0 group-hover/section:opacity-100" />
                <p className="text-base-content/60 group-hover/section:text-primary font-mono text-sm font-medium transition-all">
                    Seamless Sync
                </p>
                <div className="bg-primary/80 h-4 w-0.5 -translate-x-1.5 rounded-full opacity-0 transition-all group-hover/section:translate-x-0 group-hover/section:opacity-100" />
            </div>
            <p className="mt-2 text-center text-2xl font-semibold sm:text-3xl">Powerful Integrations</p>
            <div className="mt-2 flex justify-center text-center">
                <p className="text-base-content/80 max-w-lg">
                    Our platform integrates with the tools you already use, making automation smooth and effortless
                </p>
            </div>
            <motion.div
                className="relative mt-8 grid grid-cols-1 gap-6 md:mt-12 md:grid-cols-2 lg:mt-16 xl:grid-cols-3 2xl:mt-24"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                variants={containerVariants}>
                {data.map((item, index) => (
                    <motion.div
                        className="card group bg-base-100 relative cursor-pointer overflow-hidden p-6 shadow"
                        custom={index}
                        variants={itemVariants}
                        whileHover={{ scale: 1.05, boxShadow: "0px 10px 20px rgba(0, 0, 0, 0.1)" }}
                        key={index}>
                        <div className="flex justify-between">
                            <img src={item.image} className="h-9" alt={item.image} />
                            <span className="group-hover:text-base-content text-base-content/60 text-sm font-medium capitalize italic transition-all">
                                {item.category}
                            </span>
                        </div>
                        <p className="mt-3 text-lg font-medium">{item.title}</p>
                        <p className="text-base-content/80 line-clamp-2 text-sm">{item.description}</p>
                        <img
                            src={item.image}
                            className="absolute -end-2 -bottom-2 h-20 opacity-5 grayscale transition-all duration-300 group-hover:opacity-25 group-hover:grayscale-25"
                            alt={item.image}
                        />
                    </motion.div>
                ))}
            </motion.div>
        </div>
    );
};

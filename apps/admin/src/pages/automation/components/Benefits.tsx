import { Variants, motion } from 'motion/react';

const data = [
  {
    title: 'Master Your Domain',
    description:
      'Deep understanding of your content without configuration or training',
    iconClass: 'bg-primary/10 text-primary',
    icon: 'lucide--brain',
  },
  {
    title: 'Reduce Context Switching',
    description:
      'All your knowledge in one place—stop jumping between docs and tools',
    iconClass: 'bg-secondary/10 text-secondary',
    icon: 'lucide--focus',
  },
  {
    title: 'Eliminate Knowledge Silos',
    description:
      'Automatically connect insights across teams, projects, and documents',
    iconClass: 'bg-accent/10 text-accent',
    icon: 'lucide--network',
  },
  {
    title: 'Scale Effortlessly',
    description:
      'From startup to enterprise—grows with your team and knowledge base',
    iconClass: 'bg-info/10 text-info',
    icon: 'lucide--trending-up',
  },
  {
    title: 'Stay In Sync',
    description:
      'Real-time updates keep everyone working from the latest information',
    iconClass: 'bg-success/10 text-success',
    icon: 'lucide--refresh-cw',
  },
  {
    title: 'Surface Hidden Insights',
    description:
      'Proactive intelligence reveals patterns and connections you would miss',
    iconClass: 'bg-warning/10 text-warning',
    icon: 'lucide--sparkles',
  },
];

const containerVariants: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.2 }, // Stagger each feature
  },
};

const featureVariants: Variants = {
  hidden: { opacity: 0, y: 50, scale: 0.8 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 100, damping: 12, duration: 0.8 },
  },
};

export const Benefits = () => {
  return (
    <div
      className="group bg-base-200/25 container scroll-mt-12 rounded-2xl py-8 md:py-12 lg:py-16 2xl:py-28"
      id="benefits"
    >
      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8 2xl:gap-12">
        <div>
          <div className="flex items-center gap-1.5 max-lg:justify-center">
            <div className="bg-primary/80 h-4 w-0.5 translate-x-1.5 rounded-full opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
            <p className="text-base-content/60 group-hover:text-primary font-mono text-sm font-medium transition-all">
              Key Benefits
            </p>
            <div className="bg-primary/80 h-4 w-0.5 -translate-x-1.5 rounded-full opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
          </div>
          <p className="mt-2 text-2xl font-semibold max-lg:text-center sm:text-3xl">
            Why Teams Choose Emergent
          </p>
          <div className="mt-2 flex max-lg:justify-center max-lg:text-center">
            <p className="text-base-content/80 max-w-lg">
              Transform how your organization captures, connects, and leverages
              knowledge
            </p>
          </div>
        </div>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.4 }}
          variants={containerVariants}
          className="grid h-fit gap-6 sm:grid-cols-2"
        >
          {data.map((item, index) => (
            <motion.div
              variants={featureVariants}
              className="card bg-base-100 p-4 shadow"
              key={index}
            >
              <div className={`rounded-box w-fit p-1.5 ${item.iconClass}`}>
                <span className={`iconify ${item.icon} block size-5`}></span>
              </div>
              <p className="mt-2 font-medium">{item.title}</p>
              <p className="text-base-content/80 text-sm">{item.description}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
};

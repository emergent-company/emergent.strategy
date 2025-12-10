import { Variants, motion } from 'motion/react';

const data = [
  {
    title: 'Board Decks in 15 Minutes',
    description:
      'Generate strategic reviews from your living knowledge graph instead of 10-15 hours of manual assembly',
    iconClass: 'bg-accent/10 text-accent',
    icon: 'lucide--presentation',
  },
  {
    title: 'Strategic Planning in 3 Days',
    description:
      'Scaffold complete strategy with OKRs, RATs, and Key Results—vs 3 weeks manual',
    iconClass: 'bg-secondary/10 text-secondary',
    icon: 'lucide--rocket',
  },
  {
    title: 'Engineers Trace the Why',
    description:
      'Every work item links to OKRs and company goals in one query—no more "why are we building this?"',
    iconClass: 'bg-primary/10 text-primary',
    icon: 'lucide--git-branch',
  },
  {
    title: 'New PMs Onboard in 3 Days',
    description:
      'Queryable strategy graph replaces 50 scattered Google Docs—from 2-3 weeks to days',
    iconClass: 'bg-info/10 text-info',
    icon: 'lucide--user-plus',
  },
  {
    title: 'Discover Hidden Blockers',
    description:
      'Agents flag unvalidated assumptions blocking Key Results before they become problems',
    iconClass: 'bg-warning/10 text-warning',
    icon: 'lucide--alert-triangle',
  },
  {
    title: 'Evidence-Based Pivots',
    description:
      'Calibration memos document learnings and propose adjustments—systematic adaptation, not chaotic pivoting',
    iconClass: 'bg-success/10 text-success',
    icon: 'lucide--trending-up',
  },
];

const containerVariants: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.2 },
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
            <div className="bg-accent/80 h-4 w-0.5 translate-x-1.5 rounded-full opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
            <p className="text-base-content/60 group-hover:text-accent font-mono text-sm font-medium transition-all">
              Key Benefits
            </p>
            <div className="bg-accent/80 h-4 w-0.5 -translate-x-1.5 rounded-full opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
          </div>
          <p className="mt-2 text-2xl font-semibold max-lg:text-center sm:text-3xl">
            Greater Than the Sum of Its Parts
          </p>
          <div className="mt-2 flex max-lg:justify-center max-lg:text-center">
            <p className="text-base-content/80 max-w-lg">
              When simple building blocks combine through clear rules, the
              output is exponentially greater than the input. Here's what
              emerges.
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

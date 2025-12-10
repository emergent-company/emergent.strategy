import { Variants, motion } from 'motion/react';

const ecosystemProducts = [
  {
    id: 'core',
    name: 'emergent.core',
    tagline: 'The Knowledge Engine',
    description:
      'Document ingestion, knowledge graphs, semantic search, and grounded AI chat. The substrate from which understanding emerges.',
    icon: 'lucide--database',
    gradient: 'from-accent to-secondary',
    status: 'Live',
    evolutionRole: 'Memory & Substrate',
  },
  {
    id: 'product',
    name: 'emergent.product',
    tagline: 'Strategy That Evolves',
    description:
      'Executable operating system for product development. READY-FIRE-AIM loops that mimic natural selection—variation, execution, selection.',
    icon: 'lucide--compass',
    gradient: 'from-secondary to-primary',
    status: 'Live',
    evolutionRole: 'Adaptation & Selection',
  },
  {
    id: 'tools',
    name: 'emergent.tools',
    tagline: 'Developer Utilities',
    description:
      'CLI tools, MCP servers, and integration adapters. The composable nervous system that connects understanding to action.',
    icon: 'lucide--wrench',
    gradient: 'from-primary to-accent',
    status: 'Coming',
    evolutionRole: 'Nervous System',
  },
];

const containerVariants: Variants = {
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 100, damping: 15 },
  },
};

export const Ecosystem = () => {
  return (
    <div
      className="group container py-8 md:py-12 lg:py-16 2xl:py-28"
      id="ecosystem"
    >
      <div className="flex items-center justify-center gap-1.5">
        <div className="bg-accent/80 h-4 w-0.5 translate-x-1.5 rounded-full opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
        <p className="text-base-content/60 group-hover:text-accent font-mono text-sm font-medium transition-all">
          The Emergent Ecosystem
        </p>
        <div className="bg-accent/80 h-4 w-0.5 -translate-x-1.5 rounded-full opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
      </div>
      <p className="mt-2 text-center text-2xl font-semibold sm:text-3xl">
        Layers of Emergence
      </p>
      <div className="mt-2 flex justify-center text-center">
        <p className="text-base-content/80 max-w-lg">
          Building blocks form higher-level building blocks. Documents become
          knowledge, knowledge becomes strategy, strategy becomes execution.
          Each layer enables the next.
        </p>
      </div>

      <motion.div
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.3 }}
        variants={containerVariants}
        className="mt-8 grid gap-6 md:mt-12 lg:grid-cols-3 2xl:mt-16"
      >
        {ecosystemProducts.map((product) => (
          <motion.div
            key={product.id}
            variants={itemVariants}
            className="group/card relative"
          >
            <div
              className={`absolute inset-0 bg-linear-to-br ${product.gradient} rounded-box opacity-0 blur-xl transition-opacity group-hover/card:opacity-20`}
            />
            <div className="bg-base-100 border-base-200 rounded-box relative border p-6">
              <div className="flex items-start justify-between">
                <div
                  className={`rounded-full bg-linear-to-br ${product.gradient} p-2.5`}
                >
                  <span
                    className={`iconify ${product.icon} text-primary-content size-5`}
                  ></span>
                </div>
                <span
                  className={`badge ${product.status === 'Live' ? 'badge-success badge-soft' : 'badge-ghost'} badge-sm`}
                >
                  {product.status}
                </span>
              </div>
              <p className="mt-4 font-mono text-lg font-semibold">
                {product.name}
              </p>
              <p className="text-base-content/60 text-sm">{product.tagline}</p>
              <p className="text-base-content/80 mt-3 text-sm">
                {product.description}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span className="iconify lucide--dna text-accent/60 size-3.5"></span>
                <span className="text-base-content/50 text-xs font-medium">
                  {product.evolutionRole}
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      <div className="mt-8 flex justify-center md:mt-12">
        <div className="bg-base-200/50 rounded-box inline-flex items-center gap-3 px-4 py-3">
          <span className="iconify lucide--dna text-accent size-5"></span>
          <p className="text-base-content/80 text-sm">
            <span className="font-medium">The future is emergent.</span>{' '}
            Intelligence arises from connected systems adapting to feedback—not
            from static plans.
          </p>
        </div>
      </div>
    </div>
  );
};

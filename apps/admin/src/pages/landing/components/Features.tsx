import { Icon } from '@/components/atoms/Icon';
import {
  IconBadge,
  IconBadgeColor,
} from '@/components/molecules/IconBadge/IconBadge';

interface FeatureItem {
  icon: string;
  title: string;
  description: string;
  color: IconBadgeColor;
}

const principles: FeatureItem[] = [
  {
    icon: 'lucide--network',
    title: 'Interconnected Context',
    description:
      'Knowledge graphs connect intent to execution—trace decisions, understand dependencies, and maintain coherent understanding across your entire system',
    color: 'primary',
  },
  {
    icon: 'lucide--brain',
    title: 'Intelligent Agency',
    description:
      'AI agents that reason over structured knowledge, anticipate needs, and take autonomous action—from strategic synthesis to artifact generation',
    color: 'secondary',
  },
  {
    icon: 'lucide--refresh-cw',
    title: 'Continuous Adaptation',
    description:
      'Systems that learn from outcomes, evolve with your domain, and refine understanding over time—turning feedback into intelligence',
    color: 'accent',
  },
];

export const Features = () => {
  return (
    <div className="py-8 md:py-12 2xl:py-24 xl:py-16 container">
      <div className="text-center">
        <IconBadge
          icon="lucide--sparkles"
          color="primary"
          aria-label="Vision"
        />
        <p
          id="fade-in"
          className="mt-4 font-semibold text-2xl sm:text-3xl custom-fade-in"
        >
          Three Principles of Adaptive Systems
        </p>
        <p className="inline-block mt-3 max-w-2xl max-sm:text-sm text-base-content/70">
          Building truly intelligent applications requires more than LLMs—it
          demands infrastructure that mirrors how knowledge actually works:
          connected, contextual, and continuously evolving.
        </p>
      </div>
      <div className="gap-6 2xl:gap-8 grid grid-cols-1 md:grid-cols-3 mt-12 2xl:mt-24 xl:mt-16">
        {principles.map((principle, index) => {
          return (
            <div
              className="hover:bg-base-200/40 border border-base-300 hover:border-base-300/60 transition-all duration-300 card"
              key={index}
            >
              <div className="card-body">
                <div>
                  <IconBadge icon={principle.icon} color={principle.color} />
                  <p className="mt-4 font-semibold text-xl">
                    {principle.title}
                  </p>
                  <p className="mt-2 text-sm text-base-content/80 leading-relaxed">
                    {principle.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* How it works section */}
      <div className="mt-16 md:mt-24 2xl:mt-32">
        <div className="text-center mb-12">
          <p className="font-semibold text-xl sm:text-2xl">
            From Vision to Reality
          </p>
          <p className="mt-3 text-base-content/70 max-w-2xl mx-auto">
            We're building the infrastructure and products that embody these
            principles
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* emergent.core card */}
          <div className="card border border-base-300 hover:border-primary/50 transition-all">
            <div className="card-body">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">emergent.core</h3>
                  <p className="text-sm text-base-content/60">
                    Infrastructure Layer
                  </p>
                </div>
                <span className="badge badge-accent badge-sm">
                  Infrastructure Layer
                </span>
              </div>
              <p className="mt-3 text-sm text-base-content/80">
                Production-grade knowledge infrastructure with graph modeling,
                semantic vectors, RAG pipelines, and agent frameworks—ready to
                deploy.
              </p>
              <div className="card-actions mt-4">
                <a
                  href="/emergent-core"
                  className="btn btn-primary btn-sm gap-2"
                >
                  <Icon
                    icon="lucide--arrow-right"
                    className="size-4"
                    ariaLabel="Explore"
                  />
                  Explore Core
                </a>
              </div>
            </div>
          </div>

          {/* emergent.product card */}
          <div className="card border border-base-300 hover:border-secondary/50 transition-all">
            <div className="card-body">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg">emergent.product</h3>
                  <p className="text-sm text-base-content/60">Solution Layer</p>
                </div>
                <span className="badge badge-secondary badge-sm">
                  Solution Layer
                </span>
              </div>
              <p className="mt-3 text-sm text-base-content/80">
                Living product bible built on emergent.core—strategic agents
                that connect intent to execution using knowledge graphs and
                scientific de-risking.
              </p>
              <div className="card-actions mt-4">
                <a href="/solutions" className="btn btn-ghost btn-sm gap-2">
                  <Icon
                    icon="lucide--info"
                    className="size-4"
                    ariaLabel="Learn More"
                  />
                  Learn More
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

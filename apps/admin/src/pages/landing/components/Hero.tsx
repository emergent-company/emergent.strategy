import { Link } from 'react-router';

import { Graph3DBackground } from './Graph3DBackground';

export const Hero = () => {
  return (
    <>
      <div className="relative z-2 overflow-hidden lg:h-screen" id="hero">
        {/* Grainy texture background */}
        <div className="absolute inset-0 -z-1 opacity-20 grainy"></div>
        <Graph3DBackground />
        <div className="container flex items-center justify-center pt-20 md:pt-28 xl:pt-36 2xl:pt-48 pb-20 md:pb-28 xl:pb-36 2xl:pb-48">
          <div className="w-100 text-center md:w-120 xl:w-160 2xl:w-200">
            <div className="flex justify-center">
              <Link
                className="inline-flex items-center rounded-full border border-white/60 dark:border-white/5 bg-white/40 dark:bg-white/5 hover:bg-white/60 dark:hover:bg-white/10 py-0.5 ps-1 pe-2 text-sm transition-all"
                to="/emergent-core"
                target="_self"
              >
                <div className="flex justify-center items-center bg-primary/10 dark:bg-white/5 px-1.5 py-0 border border-primary/10 dark:border-white/5 rounded-full font-medium text-primary dark:text-white text-xs">
                  NEW
                </div>{' '}
                Introducing emergent.core
              </Link>
            </div>
            <p className="mt-3 text-2xl leading-tight font-extrabold tracking-[-0.5px] transition-all duration-1000 md:text-4xl xl:text-5xl 2xl:text-6xl starting:scale-110 starting:blur-md">
              Systems That Learn,
              <br />
              <span className="animate-background-shift from-secondary via-accent to-primary dark:from-secondary dark:via-accent dark:to-primary bg-linear-to-r bg-[400%,400%] bg-clip-text text-transparent">
                Adapt, and Evolve
              </span>
            </p>
            <p className="text-base-content/80 mt-5 xl:text-lg">
              Build AI applications on adaptive infrastructure—where knowledge
              graphs meet intelligent agents, creating systems that understand
              context, anticipate needs, and evolve with your domain.
            </p>
            <div className="mt-8 inline-flex justify-center gap-3 transition-all duration-1000 starting:scale-110">
              <Link
                to="/emergent-core"
                className="btn btn-primary shadow-primary/20 shadow-xl"
              >
                <span className="iconify lucide--boxes size-4"></span>
                Explore Core
              </Link>
              <Link to="#features" className="btn btn-ghost">
                <span className="iconify lucide--arrow-down size-4"></span>
                Learn More
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="from-secondary via-accent to-primary dark:from-secondary dark:via-accent dark:to-primary mb-8 h-1 w-full bg-linear-to-r max-xl:mt-6 md:mb-12 xl:mb-16 2xl:mb-28"></div>
    </>
  );
};

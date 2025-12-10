import { Link } from 'react-router';

import { WavePath } from './WavePath';

export const Hero = () => {
  return (
    <>
      <div className="relative z-2 overflow-hidden lg:h-screen" id="hero">
        {/* Grainy texture background */}
        <div className="absolute inset-0 -z-1 opacity-20 grainy"></div>
        <div className="container flex items-center justify-center pt-20 md:pt-28 xl:pt-36 2xl:pt-48">
          <div className="w-100 text-center md:w-120 xl:w-160 2xl:w-200">
            <div className="flex justify-center">
              <div className="inline-flex items-center rounded-full border border-accent/20 bg-accent/5 py-0.5 ps-2.5 pe-1 text-sm">
                <span className="ms-1 font-medium text-accent">
                  emergent.product
                </span>
                <div className="ms-2 rounded-full bg-accent p-0.5">
                  <span className="iconify lucide--target block size-3 text-white"></span>
                </div>
              </div>
            </div>
            <p className="mt-3 text-2xl leading-tight font-extrabold tracking-[-0.5px] transition-all duration-1000 md:text-4xl xl:text-5xl 2xl:text-6xl starting:scale-110 starting:blur-md">
              Strategy That
              <br />
              <span className="animate-background-shift from-accent to-primary bg-linear-to-r bg-[400%,400%] bg-clip-text text-transparent">
                Evolves
              </span>
            </p>
            <p className="text-base-content/80 mt-5 xl:text-lg">
              Simple building blocks—OKRs, Key Results, RATs—combined through
              clear rules create emergent intelligence far greater than the sum
              of its parts. Design the system, discover the strategy.
            </p>
            <div className="mt-8 inline-flex justify-center gap-3 transition-all duration-1000 starting:scale-110">
              <Link
                to="/admin"
                className="btn btn-accent shadow-accent/20 shadow-xl"
              >
                Start Building
              </Link>
              <Link to="#features" className="btn btn-ghost">
                <span className="iconify lucide--arrow-down size-4"></span>
                Explore Framework
              </Link>
            </div>
          </div>
        </div>
        <div className="flex justify-between max-xl:mt-16">
          <div className="transition-all delay-1400 duration-1000 starting:opacity-0 starting:blur-md">
            <div className="border-accent/40 group hover:border-accent/80 -ms-1 rounded-r-4xl border-dashed transition-all max-md:hidden xl:h-120 xl:w-80 xl:border 2xl:h-160 2xl:w-120">
              <div className="relative z-10">
                <div className="bg-base-100 border-accent/60 group-hover:border-accent/80 rounded-box w-52 border border-dashed p-4 text-center transition-all xl:absolute xl:end-0 xl:top-20 xl:translate-x-1/2 2xl:top-44">
                  <div className="bg-accent/10 text-accent inline-block rounded-full p-2.5">
                    <span className="iconify lucide--compass block size-6"></span>
                  </div>
                  <p className="text-accent mt-1 font-medium">READY</p>
                  <p className="text-base-content/60 text-xs">Sense & Frame</p>
                </div>
                <div className="rounded-box card bg-base-100 absolute end-20 top-68 w-48 p-3 shadow max-2xl:hidden">
                  <div className="flex items-center gap-2">
                    <div className="bg-accent/10 rounded-full p-1.5">
                      <span className="iconify lucide--target text-accent size-4"></span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Track OKRs</p>
                      <p className="text-base-content/60 text-xs">
                        4 parallel tracks
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="relative mt-1 grow transition-all delay-500 duration-1000 sm:delay-2000 lg:mt-3 xl:mt-24 2xl:mt-47 starting:scale-120 starting:opacity-0 starting:blur-md">
            <div className="mt-8 flex flex-col items-center gap-4">
              <div className="bg-accent text-accent-content shadow-accent/20 inline-block rounded-full p-4 shadow-lg">
                <span className="iconify lucide--rocket block size-7"></span>
              </div>

                <div className="from-accent to-primary text-primary-content rounded-box w-60 bg-linear-to-r p-4">
                <p className="text-center font-medium">
                  Executable Strategy Graph
                </p>
              </div>
            </div>
            <div className="absolute -start-8 -end-8 top-0 -z-1 md:-start-6 md:-end-6">
              <WavePath />
            </div>
          </div>
          <div className="transition-all delay-1400 duration-1000 starting:opacity-0 starting:blur-md">
            <div className="border-primary/40 hover:border-primary/80 group -me-1 rounded-s-4xl border-dashed transition-all max-md:hidden xl:h-120 xl:w-80 xl:border 2xl:h-160 2xl:w-120">
              <div className="xl:relative">
                <div className="bg-base-100 border-primary/60 rounded-box group-hover:border-primary/80 w-52 border border-dashed p-4 text-center transition-all xl:absolute xl:start-0 xl:top-20 xl:-translate-x-1/2 xl:border 2xl:top-44">
                  <div className="bg-primary/5 text-primary inline-block rounded-full p-2.5">
                    <span className="iconify lucide--crosshair block size-6"></span>
                  </div>
                  <p className="text-primary mt-1 font-medium">AIM</p>
                  <p className="text-base-content/60 text-xs">
                    Measure & Recalibrate
                  </p>
                </div>
                <div className="rounded-box card bg-base-100 absolute start-20 top-70 p-3 shadow max-2xl:hidden">
                  <p className="text-base-content/80 text-sm">
                    Learning Velocity
                  </p>
                  <div className="mt-0.5 flex gap-1">
                    <progress
                      className="progress progress-primary mt-0.5 h-1 w-full"
                      value="100"
                      max="100"
                    ></progress>
                    <progress
                      className="progress progress-primary mt-0.5 h-1 w-full"
                      value="100"
                      max="100"
                    ></progress>
                    <progress
                      className="progress progress-primary mt-0.5 h-1 w-full"
                      value="100"
                      max="100"
                    ></progress>
                    <progress
                      className="progress progress-primary mt-0.5 h-1 w-full"
                      value="60"
                      max="100"
                    ></progress>
                    <progress
                      className="progress progress-primary mt-0.5 h-1 w-full"
                      value="0"
                      max="100"
                    ></progress>
                  </div>
                  <div className="text-base-content/80 mt-2.5 flex items-center gap-3 text-sm">
                    <span className="iconify lucide--trending-up text-primary size-4"></span>
                    Insights{' '}
                    <span className="badge badge-ghost badge-xs ms-auto">
                      +24%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute -start-1 -top-1 delay-500 duration-1000 starting:opacity-0 starting:blur-md">
          <div className="border-secondary/80 group hover:border-secondary rounded-br-4xl border max-xl:hidden xl:h-120 xl:w-50 2xl:h-140 2xl:w-70">
            <div className="bg-base-100 border-secondary/60 group-hover:border-secondary rounded-box absolute end-0 w-52 translate-x-1/2 border p-4 text-center transition-all xl:top-40 2xl:top-50">
              <div className="bg-secondary/10 text-secondary inline-block rounded-full p-2.5">
                <span className="iconify lucide--zap block size-6"></span>
              </div>
              <p className="text-secondary mt-1 font-medium">FIRE</p>
              <p className="text-base-content/60 text-xs">Build & Deliver</p>
            </div>
                <div className="rounded-box card bg-base-100 absolute start-10 top-40 z-2 overflow-visible shadow max-2xl:hidden">
              <div className="flex items-center gap-3 p-3">
                <div className="bg-secondary/10 rounded-full p-2">
                  <span className="iconify lucide--check-circle text-secondary block size-4"></span>
                </div>
                <div>
                  <p className="text-base-content/80 text-sm/none font-medium">
                    Key Results
                  </p>
                  <p className="text-base-content/60 text-xs">8 in progress</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute -end-1 -top-1 delay-500 duration-1000 starting:opacity-0 starting:blur-md">
          <div className="group rounded-bl-4xl border border-orange-500/40 transition-all hover:border-orange-500/80 max-xl:hidden xl:h-120 xl:w-50 2xl:h-140 2xl:w-70">
            <div className="bg-base-100 rounded-box absolute start-0 w-52 -translate-x-1/2 border border-orange-500/60 p-4 text-center transition-all group-hover:border-orange-500/80 xl:top-40 2xl:top-50">
              <div className="inline-block rounded-full bg-orange-500/10 p-2.5 text-orange-500">
                <span className="iconify lucide--bot block size-6"></span>
              </div>
              <p className="mt-1 font-medium text-orange-500">AI Agents</p>
            </div>
            <div className="rounded-box card bg-base-100 absolute start-10 top-40 shadow max-2xl:hidden">
              <div className="flex items-center gap-3 p-3">
                <div className="rounded-full bg-orange-500 p-2 text-white">
                  <span className="iconify lucide--sparkles block size-4"></span>
                </div>
                <div>
                  <div className="skeleton rounded-box h-2 w-16"></div>
                  <div className="skeleton rounded-box mt-1 h-2.5 w-8"></div>
                </div>
                <p className="text-sm font-medium text-orange-500">Active</p>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-accent/5 absolute -start-20 -bottom-20 -z-1 size-100 rounded-full blur-[150px] max-lg:hidden"></div>
        <div className="bg-primary/5 absolute end-0 bottom-0 -z-1 size-105 rounded-full blur-[150px] max-lg:hidden"></div>
        <div className="absolute end-0 -top-20 -z-1 size-100 rounded-full bg-orange-300/5 blur-[150px] max-lg:hidden dark:bg-orange-200/5"></div>
      </div>

      <div className="from-accent via-secondary to-primary dark:from-accent dark:via-secondary dark:to-primary mb-8 h-1 w-full bg-linear-to-r max-xl:mt-6 md:mb-12 xl:mb-16 2xl:mb-28"></div>
    </>
  );
};

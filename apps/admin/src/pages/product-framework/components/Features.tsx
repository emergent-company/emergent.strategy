export const Features = () => {
  return (
    <div
      className="group/section container scroll-mt-12 py-8 md:py-12 lg:py-16 2xl:py-28"
      id="features"
    >
      <div className="flex items-center justify-center gap-1.5">
        <div className="bg-accent/80 h-4 w-0.5 translate-x-1.5 rounded-full opacity-0 transition-all group-hover/section:translate-x-0 group-hover/section:opacity-100" />
        <p className="text-base-content/60 group-hover/section:text-accent font-mono text-sm font-medium transition-all">
          Core Capabilities
        </p>
        <div className="bg-accent/80 h-4 w-0.5 -translate-x-1.5 rounded-full opacity-0 transition-all group-hover/section:translate-x-0 group-hover/section:opacity-100" />
      </div>
      <p className="mt-2 text-center text-2xl font-semibold sm:text-3xl">
        Building Blocks + Rules = Emergent Strategy
      </p>
      <div className="mt-2 flex justify-center text-center">
        <p className="text-base-content/80 max-w-lg">
          Simple components connected through clear rules create self-organizing
          complexity. Not chaos, not rigidity—organized emergence that surprises
          even its creators.
        </p>
      </div>
      <div className="mt-8 grid gap-6 md:mt-12 md:grid-cols-2 lg:mt-16 xl:grid-cols-3 2xl:mt-24">
        {/* Feature 1: Knowledge Graph */}
        <div className="bg-base-100 card group relative cursor-pointer overflow-hidden shadow transition-all hover:shadow-lg">
          <div className="p-5">
            <div className="bg-accent/10 inline-flex rounded-full p-2.5">
              <span className="iconify lucide--network text-accent size-6"></span>
            </div>
            <p className="mt-3 text-lg font-medium">
              Executable Strategy Graph
            </p>
            <p className="text-base-content/80 mt-0.5 text-sm">
              Version-controlled YAML for OKRs, Key Results, RATs, and Feature
              Definitions. Trace intent to assumptions to outcomes in a single
              connected system.
            </p>
            <div className="absolute end-1 top-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="text-base-content/10 group-hover:text-accent h-14 transition-all duration-300 *:stroke-[1px] group-hover:h-16 group-hover:*:stroke-[1px]"
                viewBox="0 0 24 24"
              >
                <g fill="none" stroke="currentColor">
                  <circle cx="5" cy="5" r="3" />
                  <circle cx="19" cy="5" r="3" />
                  <circle cx="12" cy="19" r="3" />
                  <path d="M7 7l5 10M17 7l-5 10" />
                </g>
              </svg>
            </div>
          </div>
        </div>

        {/* Feature 2: READY-FIRE-AIM Loop */}
        <div className="bg-base-100 card group relative cursor-pointer overflow-hidden shadow transition-all hover:shadow-lg">
          <div className="p-5">
            <div className="bg-secondary/10 inline-flex rounded-full p-2.5">
              <span className="iconify lucide--repeat text-secondary size-6"></span>
            </div>
            <p className="mt-3 text-lg font-medium">READY-FIRE-AIM Loop</p>
            <p className="text-base-content/80 mt-0.5 text-sm">
              Continuous sensing, responsive execution, and evidence-based
              calibration. Not linear roadmaps—adaptive cycles that learn from
              reality.
            </p>
            <div className="absolute end-1 top-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="text-base-content/10 group-hover:text-secondary h-14 transition-all duration-300 *:stroke-[1px] group-hover:h-16 group-hover:*:stroke-[1px]"
                viewBox="0 0 24 24"
              >
                <path
                  fill="none"
                  stroke="currentColor"
                  d="M17 2.1l4 4-4 4M3 12.2v-2a4 4 0 0 1 4-4h12.8M7 21.9l-4-4 4-4M21 11.8v2a4 4 0 0 1-4 4H4.2"
                  color="currentColor"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Feature 3: Strategic Agents */}
        <div className="bg-base-100 card group relative cursor-pointer overflow-hidden shadow transition-all hover:shadow-lg">
          <div className="p-5">
            <div className="bg-base-200 inline-flex rounded-full p-2.5">
              <span className="iconify lucide--bot size-6"></span>
            </div>
            <p className="mt-3 text-lg font-medium">AI Knowledge Agents</p>
            <p className="text-base-content/80 mt-0.5 text-sm">
              Pathfinder (READY), Product Architect (FIRE), Synthesizer
              (AIM)—agents that reason over your strategy graph and generate
              validated artifacts.
            </p>
            <div className="absolute end-3.5 top-3.5">
              <svg
                className="group-hover:animate-vibrate text-base-content/5 h-10 stroke-[1.5px] transition-all group-hover:h-11 group-hover:text-orange-400"
                viewBox="0 0 24 24"
              >
                <path
                  fill="none"
                  stroke="currentColor"
                  d="M10.268 21a2 2 0 0 0 3.464 0M22 8c0-2.3-.8-4.3-2-6M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326M4 2C2.8 3.7 2 5.7 2 8"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Feature 4: Scientific De-risking */}
        <div className="bg-base-100 card group relative cursor-pointer overflow-hidden shadow transition-all hover:shadow-lg">
          <div className="p-5">
            <div className="bg-base-200 inline-flex rounded-full p-2.5">
              <span className="iconify lucide--flask-conical size-6"></span>
            </div>
            <p className="mt-3 text-lg font-medium">Scientific De-risking</p>
            <p className="text-base-content/80 mt-0.5 text-sm">
              Riskiest Assumptions Tested (RATs) management with falsification
              mindset. Prove assumptions wrong faster, not right slower.
              Evidence-based confidence scoring.
            </p>
            <div className="absolute end-3.5 top-3.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="text-base-content/5 group-hover:text-accent h-10 transition-all group-hover:h-11"
                viewBox="0 0 24 24"
              >
                <path
                  fill="currentColor"
                  d="M10 2v7.31l-4.93 7.39A2 2 0 0 0 6.73 20h10.54a2 2 0 0 0 1.66-3.3L14 9.31V2M8.5 2h7M7 16h10"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Feature 5: Artifact Generation */}
        <div className="bg-base-100 card group relative cursor-pointer overflow-hidden shadow transition-all hover:shadow-lg">
          <div className="p-5">
            <div className="bg-base-200 inline-flex rounded-full p-2.5">
              <span className="iconify lucide--file-output size-6"></span>
            </div>
            <p className="mt-3 text-lg font-medium">Living Artifacts</p>
            <p className="text-base-content/80 mt-0.5 text-sm">
              Feature Definitions, calibration memos, assessment reports—all
              machine-readable YAML generated from your strategy graph and
              rendered on demand.
            </p>
            <div className="absolute end-3.5 top-3.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="group-hover:animate-wave text-base-content/5 group-hover:text-accent h-10 stroke-[1.5px] transition-all group-hover:h-11"
                viewBox="0 0 24 24"
              >
                <g fill="none" stroke="currentColor">
                  <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2m0 4V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2m0 4.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
                  <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
                </g>
              </svg>
            </div>
          </div>
        </div>

        {/* Feature 6: Four Value Tracks */}
        <div className="bg-base-100 card group relative cursor-pointer overflow-hidden shadow">
          <div className="p-5">
            <div className="bg-base-200 inline-flex rounded-full p-2.5">
              <span className="iconify lucide--layers size-6"></span>
            </div>
            <p className="mt-3 text-lg font-medium">Four Parallel Tracks</p>
            <p className="text-base-content/80 mt-0.5 text-sm">
              Product, Strategy, Org/Ops, and Commercial—each with its own OKRs
              and Key Results. Cross-track dependencies are explicit and
              traceable.
            </p>
            <div className="absolute end-4 bottom-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="size-8 -translate-x-1.5 stroke-[1.5px] opacity-20 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-60"
                viewBox="0 0 24 24"
              >
                <path
                  fill="none"
                  stroke="currentColor"
                  d="m18 8l4 4l-4 4M2 12h20"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

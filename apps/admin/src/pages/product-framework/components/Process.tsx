export const Process = () => {
  return (
    <div
      className="group container py-8 md:py-12 lg:py-16 2xl:py-28"
      id="process"
    >
      <div className="flex items-center justify-center gap-1.5">
        <div className="bg-accent/80 h-4 w-0.5 translate-x-1.5 rounded-full opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
        <p className="text-base-content/60 group-hover:text-accent font-mono text-sm font-medium transition-all">
          Operating Loop
        </p>
        <div className="bg-accent/80 h-4 w-0.5 -translate-x-1.5 rounded-full opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
      </div>
      <p className="mt-2 text-center text-2xl font-semibold sm:text-3xl">
        READY &rarr; FIRE &rarr; AIM
      </p>
      <div className="mt-2 flex justify-center text-center">
        <p className="text-base-content/80 max-w-lg">
          Design by Emergence: invent the rules (OKRs, RATs), then discover the
          consequences through iteration. Strategy can't be shortcut—you have
          to run the experiment.
        </p>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 md:mt-12 lg:mt-16 xl:grid-cols-3 2xl:mt-24">
        {/* READY Phase */}
        <div>
          <div className="flex items-center justify-center">
            <div className="from-accent to-secondary text-accent-content rounded-full border border-transparent bg-linear-to-br p-3">
              <span className="iconify lucide--compass block size-6"></span>
            </div>
          </div>
          <div className="card from-accent to-secondary text-accent-content mt-4 min-h-80 bg-linear-to-br p-5">
            <p className="text-center text-lg font-medium">READY</p>
            <p className="text-accent-content/80 mt-1 text-center text-sm italic">
              Sense & Frame
            </p>
            <p className="text-accent-content/90 mt-4 text-sm">
              Define track OKRs, identify RATs (Riskiest Assumptions), scaffold
              value models, and set measurable Key Results.
            </p>

            <div className="mt-6 space-y-2">
              <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm">
                <span className="iconify lucide--target size-4"></span>
                Define Track OKRs
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm">
                <span className="iconify lucide--alert-triangle size-4"></span>
                Identify RATs
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm">
                <span className="iconify lucide--check-circle size-4"></span>
                Set Key Results
              </div>
            </div>

            <div className="mt-auto pt-4">
              <div className="flex items-center justify-center gap-2 text-sm opacity-80">
                <span className="iconify lucide--bot size-4"></span>
                Pathfinder Agent
              </div>
            </div>
          </div>
        </div>

        {/* FIRE Phase */}
        <div>
          <div className="flex items-center justify-center">
            <div className="from-secondary to-primary rounded-full border border-transparent bg-linear-to-br p-0.5">
              <div className="bg-base-100 rounded-full p-2.5">
                <span className="iconify lucide--zap block size-6"></span>
              </div>
            </div>
          </div>
          <div className="from-secondary to-primary card mt-4 bg-linear-to-br p-1">
            <div className="bg-base-100 rounded-box min-h-78 p-5">
              <p className="text-center text-lg font-medium">FIRE</p>
              <p className="text-base-content/60 mt-1 text-center text-sm italic">
                Build & Deliver
              </p>
              <p className="text-base-content/80 mt-4 text-sm">
                Execute toward Key Results, run experiments to validate RATs.
                Work packages hand off to your tools (Linear, Jira, GitHub).
              </p>

              <div className="mt-6 space-y-2">
                <div className="border-base-200 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="iconify lucide--check-circle size-4 text-secondary"></span>
                  Execute Key Results
                </div>
                <div className="border-base-200 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="iconify lucide--flask-conical size-4 text-secondary"></span>
                  Run Experiments
                </div>
                <div className="border-base-200 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="iconify lucide--arrow-right-left size-4 text-secondary"></span>
                  Hand Off to Tools
                </div>
              </div>

              <div className="mt-4 flex items-center justify-center gap-2 text-sm opacity-60">
                <span className="iconify lucide--bot size-4"></span>
                Product Architect Agent
              </div>
            </div>
          </div>
        </div>

        {/* AIM Phase */}
        <div className="sm:col-span-2 xl:col-span-1">
          <div className="flex items-center justify-center">
            <div className="border-base-300 bg-base-100 rounded-full border border-dashed p-3">
              <span className="iconify lucide--crosshair block size-6"></span>
            </div>
          </div>
          <div className="card border-base-300 mt-4 min-h-80 border border-dashed p-5">
            <p className="text-center text-lg font-medium">AIM</p>
            <p className="text-base-content/60 mt-1 text-center text-sm italic">
              Measure & Recalibrate
            </p>
            <p className="text-base-content/80 mt-4 text-sm">
              Compare Actual vs. Planned KRs, update RAT status (supported,
              refuted, inconclusive), and propose calibration adjustments.
            </p>

            <div className="mt-6 space-y-2">
              <div className="text-base-content/80 flex items-center gap-2 text-sm">
                <span className="iconify lucide--bar-chart-2 text-primary size-4"></span>
                Measure outcomes vs targets
              </div>
              <div className="text-base-content/80 flex items-center gap-2 text-sm">
                <span className="iconify lucide--check-circle text-success size-4"></span>
                Validate or refute assumptions
              </div>
              <div className="text-base-content/80 flex items-center gap-2 text-sm">
                <span className="iconify lucide--refresh-cw text-accent size-4"></span>
                Generate calibration memos
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <button className="btn btn-soft btn-accent btn-sm gap-2">
                <span className="iconify lucide--file-text size-4"></span>
                Assessment Reports
              </button>
              <button className="btn btn-soft btn-accent btn-sm gap-2">
                <span className="iconify lucide--presentation size-4"></span>
                Board Decks
              </button>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2 text-sm opacity-60">
              <span className="iconify lucide--bot size-4"></span>
              Synthesizer Agent
            </div>
          </div>
        </div>
      </div>

      {/* Loop Arrow */}
      <div className="mt-8 flex justify-center">
        <div className="text-base-content/40 flex items-center gap-3 text-sm">
          <span className="iconify lucide--repeat size-5"></span>
          Continuous learning loop — evidence feeds back into the next READY
          phase
        </div>
      </div>
    </div>
  );
};

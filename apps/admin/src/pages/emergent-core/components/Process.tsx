export const Process = () => {
  return (
    <div
      className="group container py-8 md:py-12 lg:py-16 2xl:py-28"
      id="process"
    >
      <div className="flex items-center justify-center gap-1.5">
        <div className="bg-primary/80 h-4 w-0.5 translate-x-1.5 rounded-full opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
        <p className="text-base-content/60 group-hover:text-primary font-mono text-sm font-medium transition-all">
          Technical Architecture
        </p>
        <div className="bg-primary/80 h-4 w-0.5 -translate-x-1.5 rounded-full opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
      </div>
      <p className="mt-2 text-center text-2xl font-semibold sm:text-3xl">
        Four-Stage Intelligence Pipeline
      </p>
      <div className="mt-2 flex justify-center text-center">
        <p className="text-base-content/80 max-w-lg">
          From raw data to intelligent applications—a modular infrastructure
          that adapts to your domain
        </p>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 md:mt-12 lg:mt-16 xl:grid-cols-4 2xl:mt-24">
        <div>
          <div className="flex items-center justify-center">
            <div className="bg-base-200/60 border-base-200 rounded-full border p-3">
              <span className="iconify lucide--database block size-6"></span>
            </div>
          </div>
          <div className="card bg-base-200/60 border-base-200 mt-4 min-h-76 border p-5">
            <p className="text-center text-lg font-medium">1. Ingest</p>
            <p className="text-base-content/60 mt-1 text-center text-sm italic">
              Connect any data source through configurable adapters
            </p>
            <div className="mt-6 space-y-1.5 space-x-1.5">
              <div className="bg-base-100 rounded-box border-base-200 inline-flex items-center gap-2 border px-3 py-1.5">
                <span className="iconify lucide--server"></span>
                REST APIs
              </div>
              <div className="bg-base-100 rounded-box border-base-200 inline-flex items-center gap-2 border px-3 py-1.5">
                <span className="iconify lucide--database"></span>
                Databases
              </div>
              <div className="bg-base-100 rounded-box border-base-200 inline-flex items-center gap-2 border px-3 py-1.5">
                <span className="iconify lucide--file-text"></span>
                Files (PDF, MD)
              </div>
              <div className="bg-base-100 rounded-box border-base-200 inline-flex items-center gap-2 border px-3 py-1.5">
                <span className="iconify lucide--webhook"></span>
                Webhooks
              </div>
            </div>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-center">
            <div className="from-primary to-secondary text-primary-content rounded-full border border-transparent bg-linear-to-br p-3">
              <span className="iconify lucide--brain block size-6"></span>
            </div>
          </div>
          <div className="card from-primary to-secondary text-primary-content mt-4 min-h-76 bg-linear-to-br p-5">
            <p className="text-center text-lg font-medium">2. Understand</p>
            <p className="text-primary-content/60 mt-1 text-center text-sm italic">
              Extract entities, generate embeddings, build semantic
              representations
            </p>

            <div className="mt-10 text-center">
              <span className="iconify lucide--sparkles size-16 text-white/40"></span>
            </div>
            <div className="mt-10 flex flex-col items-center space-y-1.5 [--color-base-100:#ffffff66]">
              <div className="flex items-center gap-2">
                <div className="skeleton h-1.5 w-24 bg-white/20"></div>
                <div className="skeleton h-1.5 w-8 bg-white/20"></div>
              </div>
              <div className="skeleton h-1.5 w-50 bg-white/20"></div>
              <div className="flex items-center gap-2">
                <div className="skeleton h-1.5 w-8 bg-white/20"></div>
                <div className="skeleton h-1.5 w-16 bg-white/20"></div>
                <div className="skeleton h-1.5 w-12 bg-white/20"></div>
              </div>
            </div>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-center">
            <div className="from-primary to-secondary rounded-full border border-transparent bg-linear-to-br p-0.5">
              <div className="bg-base-100 rounded-full p-2.5">
                <span className="iconify lucide--network block size-6"></span>
              </div>
            </div>
          </div>
          <div className="from-primary to-secondary card mt-4 bg-linear-to-br p-1">
            <div className="bg-base-100 rounded-box min-h-74 p-5">
              <p className="text-center text-lg font-medium">3. Connect</p>
              <p className="text-base-content/60 mt-1 text-center text-sm italic">
                Discover relationships and build interconnected knowledge graphs
              </p>
              <div className="mt-5 space-y-2 space-x-2">
                <div className="border-base-200 rounded-box inline-flex items-center gap-2 border px-2.5 py-1">
                  <span className="iconify lucide--git-branch"></span>
                  Entity links
                </div>
                <div className="border-base-200 rounded-box inline-flex items-center gap-2 border px-2.5 py-1">
                  <span className="iconify lucide--link-2"></span>
                  References
                </div>
                <div className="border-base-200 rounded-box inline-flex items-center gap-2 border px-2.5 py-1">
                  <span className="iconify lucide--share-2"></span>
                  Graph traversal
                </div>
                <div className="border-base-200 rounded-box inline-flex items-center gap-2 border px-2.5 py-1">
                  <span className="iconify lucide--layers"></span>
                  Hierarchies
                </div>
              </div>
            </div>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-center">
            <div className="border-base-300 bg-base-100 rounded-full border border-dashed p-3">
              <span className="iconify lucide--boxes block size-6"></span>
            </div>
          </div>
          <div className="card border-base-300 mt-4 min-h-76 border border-dashed p-5">
            <p className="text-center text-lg font-medium">4. Enable</p>
            <p className="text-base-content/60 mt-1 text-center text-sm italic">
              Build intelligent applications on top of the knowledge
              infrastructure
            </p>

            <div className="mt-6 flex flex-wrap gap-2.5">
              <button className="btn btn-soft btn-primary btn-sm gap-2">
                <span className="iconify lucide--message-circle size-4"></span>
                Chat interfaces
              </button>
              <button className="btn btn-soft btn-primary btn-sm gap-2">
                <span className="iconify lucide--search size-4"></span>
                Semantic search
              </button>
              <button className="btn btn-soft btn-primary btn-sm gap-2">
                <span className="iconify lucide--cpu size-4"></span>
                AI agents
              </button>
              <button className="btn btn-soft btn-primary btn-sm gap-2">
                <span className="iconify lucide--webhook size-4"></span>
                API endpoints
              </button>
              <button className="btn btn-soft btn-primary btn-sm gap-2">
                <span className="iconify lucide--layers size-4"></span>
                Custom apps
              </button>
              <button className="btn btn-soft btn-primary btn-sm gap-2">
                <span className="iconify lucide--zap size-4"></span>
                Automations
              </button>
              <button className="btn btn-ghost btn-primary btn-sm">More</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

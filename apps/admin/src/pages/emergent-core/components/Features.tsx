export const Features = () => {
  return (
    <div
      className="group/section container scroll-mt-12 py-8 md:py-12 lg:py-16 2xl:py-28"
      id="features"
    >
      <div className="flex items-center justify-center gap-1.5">
        <div className="bg-primary/80 h-4 w-0.5 translate-x-1.5 rounded-full opacity-0 transition-all group-hover/section:translate-x-0 group-hover/section:opacity-100" />
        <p className="text-base-content/60 group-hover/section:text-primary font-mono text-sm font-medium transition-all">
          Core Capabilities
        </p>
        <div className="bg-primary/80 h-4 w-0.5 -translate-x-1.5 rounded-full opacity-0 transition-all group-hover/section:translate-x-0 group-hover/section:opacity-100" />
      </div>
      <p className="mt-2 text-center text-2xl font-semibold sm:text-3xl">
        Three Pillars of Intelligent Infrastructure
      </p>
      <div className="mt-2 flex justify-center text-center">
        <p className="text-base-content/80 max-w-lg">
          Knowledge graphs, semantic understanding, and configurable agents— the
          technical foundation for building adaptive AI systems.
        </p>
      </div>
      <div className="mt-8 grid gap-6 md:mt-12 md:grid-cols-2 lg:mt-16 xl:grid-cols-3 2xl:mt-24">
        {/* Pillar 1: Knowledge Graph */}
        <div className="bg-base-100 card group relative cursor-pointer overflow-hidden shadow transition-all hover:shadow-lg">
          <div className="p-5">
            <div className="bg-base-200 inline-flex rounded-full p-2.5">
              <span className="iconify lucide--network size-6"></span>
            </div>
            <p className="mt-3 text-lg font-medium">Knowledge Graph</p>
            <p className="text-base-content/80 mt-0.5 text-sm">
              Entity-relationship modeling with TypeORM. Documents, sections,
              chunks, and metadata—all connected with automatic cross-reference
              detection and version history.
            </p>
            <div className="absolute end-1 top-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="text-base-content/10 h-14 transition-all duration-300 *:stroke-[1px] group-hover:h-16 group-hover:text-primary group-hover:*:stroke-[1px]"
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

        {/* Pillar 2: Semantic Vectors */}
        <div className="bg-base-100 card group relative cursor-pointer overflow-hidden shadow transition-all hover:shadow-lg">
          <div className="p-5">
            <div className="bg-base-200 inline-flex rounded-full p-2.5">
              <span className="iconify lucide--brain size-6"></span>
            </div>
            <p className="mt-3 text-lg font-medium">Semantic Vectors</p>
            <p className="text-base-content/80 mt-0.5 text-sm">
              LanceDB embedded vector database with OpenAI embeddings. Hybrid
              search combines vector similarity, keyword matching, and graph
              traversal for context-aware retrieval.
            </p>
            <div className="absolute end-1 top-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="text-base-content/10 h-14 transition-all duration-300 *:stroke-[1px] group-hover:h-16 group-hover:text-primary group-hover:*:stroke-[1px]"
                viewBox="0 0 24 24"
              >
                <path
                  fill="none"
                  stroke="currentColor"
                  d="M8.628 12.674H8.17c-1.484 0-2.225 0-2.542-.49c-.316-.489-.015-1.17.588-2.533l1.812-4.098c.548-1.239.822-1.859 1.353-2.206S10.586 3 11.935 3h2.09c1.638 0 2.458 0 2.767.535c.309.536-.098 1.25-.91 2.681l-1.073 1.886c-.404.711-.606 1.066-.603 1.358c.003.378.205.726.53.917c.25.147.657.147 1.471.147c1.03 0 1.545 0 1.813.178c.349.232.531.646.467 1.061c-.049.32-.395.703-1.088 1.469l-5.535 6.12c-1.087 1.203-1.63 1.804-1.996 1.613c-.365-.19-.19-.983.16-2.569l.688-3.106c.267-1.208.4-1.812.08-2.214c-.322-.402-.937-.402-2.168-.402"
                  color="currentColor"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Pillar 3: Agent Framework */}
        <div className="bg-base-100 card group relative cursor-pointer overflow-hidden shadow transition-all hover:shadow-lg">
          <div className="p-5">
            <div className="bg-base-200 inline-flex rounded-full p-2.5">
              <span className="iconify lucide--bot size-6"></span>
            </div>
            <p className="mt-3 text-lg font-medium">Agent Framework</p>
            <p className="text-base-content/80 mt-0.5 text-sm">
              Configurable agents with tool use via Model Context Protocol
              (MCP). Multi-agent orchestration, custom behaviors, and
              observability via LangSmith tracing.
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

        {/* Supporting Feature: RAG */}
        <div className="bg-base-100 card group relative cursor-pointer overflow-hidden shadow transition-all hover:shadow-lg">
          <div className="p-5">
            <div className="bg-base-200 inline-flex rounded-full p-2.5">
              <span className="iconify lucide--sparkles size-6"></span>
            </div>
            <p className="mt-3 text-lg font-medium">RAG Pipeline</p>
            <p className="text-base-content/80 mt-0.5 text-sm">
              Multi-stage retrieval with query → embedding → search → rerank →
              context assembly. Grounded responses with source citations and
              confidence scoring.
            </p>
            <div className="absolute end-3.5 top-3.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="text-base-content/5 h-10 transition-all group-hover:h-11 group-hover:text-primary"
                viewBox="0 0 24 24"
              >
                <path
                  fill="currentColor"
                  fillRule="evenodd"
                  d="M18.955 1.25c-.433 0-.83 0-1.152.043c-.356.048-.731.16-1.04.47s-.422.684-.47 1.04c-.043.323-.043.72-.043 1.152v13.09c0 .433 0 .83.043 1.152c.048.356.16.731.47 1.04s.684.422 1.04.47c.323.043.72.043 1.152.043h.09c.433 0 .83 0 1.152-.043c.356-.048.731-.16 1.04-.47s.422-.684.47-1.04c.043-.323.043-.72.043-1.152V3.955c0-.433 0-.83-.043-1.152c-.048-.356-.16-.731-.47-1.04s-.684-.422-1.04-.47c-.323-.043-.72-.043-1.152-.043zm-1.13 1.572l-.002.001l-.001.003l-.005.01a.7.7 0 0 0-.037.167c-.028.21-.03.504-.03.997v13c0 .493.002.787.03.997a.7.7 0 0 0 .042.177l.001.003l.003.001l.003.002l.007.003c.022.009.07.024.167.037c.21.028.504.03.997.03s.787-.002.997-.03a.7.7 0 0 0 .177-.042l.003-.001l.001-.003l.005-.01a.7.7 0 0 0 .037-.167c.028-.21.03-.504.03-.997V4c0-.493-.002-.787-.03-.997a.7.7 0 0 0-.042-.177l-.001-.003l-.003-.001l-.01-.005a.7.7 0 0 0-.167-.037c-.21-.028-.504-.03-.997-.03s-.787.002-.997.03a.7.7 0 0 0-.177.042M11.955 4.25h.09c.433 0 .83 0 1.152.043c.356.048.731.16 1.04.47s.422.684.47 1.04c.043.323.043.72.043 1.152v10.09c0 .433 0 .83-.043 1.152c-.048.356-.16.731-.47 1.04s-.684.422-1.04.47c-.323.043-.72.043-1.152.043h-.09c-.432 0-.83 0-1.152-.043c-.356-.048-.731-.16-1.04-.47s-.422-.684-.47-1.04c-.043-.323-.043-.72-.043-1.152V6.955c0-.433 0-.83.043-1.152c.048-.356.16-.731.47-1.04s.684-.422 1.04-.47c.323-.043.72-.043 1.152-.043m-1.132 1.573l.003-.001l-.003 12.355l-.001-.003l-.005-.01a.7.7 0 0 1-.037-.167c-.028-.21-.03-.504-.03-.997V7c0-.493.002-.787.03-.997a.7.7 0 0 1 .042-.177zm0 12.354l.003-12.355l.003-.002l.007-.003a.7.7 0 0 1 .167-.037c.21-.028.504-.03.997-.03s.787.002.997.03a.7.7 0 0 1 .177.042l.003.001l.001.003l.005.01c.009.022.024.07.037.167c.028.21.03.504.03.997v10c0 .493-.002.787-.03.997a.7.7 0 0 1-.042.177l-.001.003l-.003.001l-.01.005a.7.7 0 0 1-.167.037c-.21.028-.504.03-.997.03s-.787-.002-.997-.03a.7.7 0 0 1-.177-.042zM4.955 8.25c-.433 0-.83 0-1.152.043c-.356.048-.731.16-1.04.47s-.422.684-.47 1.04c-.043.323-.043.72-.043 1.152v6.09c0 .433 0 .83.043 1.152c.048.356.16.731.47 1.04s.684.422 1.04.47c.323.043.72.043 1.152.043h.09c.432 0 .83 0 1.152-.043c.356-.048.731-.16 1.04-.47s.422-.684.47-1.04c.043-.323.043-.72.043-1.152v-6.09c0-.433 0-.83-.043-1.152c-.048-.356-.16-.731-.47-1.04s-.684-.422-1.04-.47c-.323-.043-.72-.043-1.152-.043m-1.132 1.573l.003-.001l-.003 8.355l-.001-.003l-.005-.01a.7.7 0 0 1-.037-.167c-.028-.21-.03-.504-.03-.997v-6c0-.493.002-.787.03-.997a.7.7 0 0 1 .042-.177zm0 8.354l.003-8.355l.003-.002l.007-.003a.7.7 0 0 1 .167-.037c.21-.028.504-.03.997-.03s.787.002.997.03a.7.7 0 0 1 .177.042l.003.001l.001.003l.005.01c.009.022.024.07.037.167c.028.21.03.504.03.997v6c0 .493-.002.787-.03.997a.7.7 0 0 1-.042.177l-.001.003l-.003.001l-.01.005a.7.7 0 0 1-.167.037c-.21.028-.504.03-.997.03s-.787-.002-.997-.03a.7.7 0 0 1-.177-.042"
                />
                <path
                  fill="currentColor"
                  className="-translate-y-1 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100"
                  d="M3 21.25a.75.75 0 0 0 0 1.5h18a.75.75 0 0 0 0-1.5z"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Supporting Feature: Template Packs */}
        <div className="bg-base-100 card group relative cursor-pointer overflow-hidden shadow transition-all hover:shadow-lg">
          <div className="p-5">
            <div className="bg-base-200 inline-flex rounded-full p-2.5">
              <span className="iconify lucide--package size-6"></span>
            </div>
            <p className="mt-3 text-lg font-medium">Template Packs</p>
            <p className="text-base-content/80 mt-0.5 text-sm">
              YAML-based product configuration with domain-specific schemas,
              prompt libraries, custom UI components, and version-controlled
              templates.
            </p>
            <div className="absolute end-3.5 top-3.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="group-hover:animate-wave text-base-content/5 h-10 stroke-[1.5px] transition-all group-hover:h-11 group-hover:text-primary"
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

        {/* Supporting Feature: Privacy */}
        <div className="bg-base-100 card group relative cursor-pointer overflow-hidden shadow">
          <div className="p-5">
            <div className="bg-base-200 inline-flex rounded-full p-2.5">
              <span className="iconify lucide--shield-check size-6"></span>
            </div>
            <p className="mt-3 text-lg font-medium">
              Privacy-First Architecture
            </p>
            <p className="text-base-content/80 mt-0.5 text-sm">
              Local-first storage with SQLite + LanceDB. On-device processing
              option with local LLMs, hybrid mode for sensitive data, and
              user-controlled data residency.
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

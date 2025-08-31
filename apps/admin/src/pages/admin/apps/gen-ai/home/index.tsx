import { MetaData } from "@/components/MetaData";
import { Icon } from "@/components/ui/Icon";

const AiHomePage = () => {
    return (
        <>
            <MetaData title="Gen AI Home" />

            <div className="flex flex-col justify-center items-center md:mt-16 lg:mt-24 xl:mt-32">
                <div className="w-full sm:max-w-4xl">
                    <div className="inline-block bg-clip-text bg-gradient-to-tr from-40% from-base-content to-primary font-semibold text-transparent text-2xl sm:text-4xl tracking-tight">
                        <p>Hi there, Denish</p>
                        <p className="mt-1">How can I assist you today?</p>
                    </div>
                    <div className="gap-6 grid md:grid-cols-3 mt-6">
                        <div className="group bg-base-100 card-border transition-all cursor-pointer card">
                            <div className="card-body">
                                <div className="bg-primary p-2 rounded-box w-fit text-primary-content">
                                    <Icon icon="lucide--sparkles" className="block size-4" ariaLabel="Sparkles" />
                                </div>
                                <p className="mt-3 font-medium">Blog Post Ideas</p>
                                <p className="mt-1 text-sm text-base-content/80 text-ellipsis line-clamp-2">
                                    Generate compelling blog topics that captivate your audience and enhance SEO.
                                </p>
                                <div className="flex items-center gap-1.5 mt-3 text-base-content/60 group-hover:text-base-content transition-all">
                                    <span className="text-sm">Explore Ideas</span>
                                    <Icon icon="lucide--chevron-right" className="size-3.5" ariaLabel="Go" />
                                </div>
                            </div>
                        </div>

                        <div className="group bg-base-100 card-border transition-all cursor-pointer card">
                            <div className="card-body">
                                <div className="bg-secondary p-2 rounded-box w-fit text-secondary-content">
                                    <Icon icon="lucide--mail" className="block size-4" ariaLabel="Email" />
                                </div>
                                <p className="mt-3 font-medium">Email Campaigns</p>
                                <p className="mt-1 text-sm text-base-content/80 text-ellipsis line-clamp-2">
                                    Create high-converting email copy that boosts engagement and builds lasting
                                    connections.
                                </p>
                                <div className="flex items-center gap-1.5 mt-3 text-base-content/60 group-hover:text-base-content transition-all">
                                    <span className="text-sm">Start Campaign</span>
                                    <Icon icon="lucide--chevron-right" className="size-3.5" ariaLabel="Go" />
                                </div>
                            </div>
                        </div>

                        <div className="group bg-base-100 card-border transition-all cursor-pointer card">
                            <div className="card-body">
                                <div className="bg-success p-2 rounded-box w-fit text-success-content">
                                    <Icon icon="lucide--text" className="block size-4" ariaLabel="Text" />
                                </div>
                                <p className="mt-3 font-medium">Social Media Captions</p>
                                <p className="mt-1 text-sm text-base-content/80 text-ellipsis line-clamp-2">
                                    Generate catchy captions designed to maximize engagement across social platforms.
                                </p>
                                <div className="flex items-center gap-1.5 mt-3 text-base-content/60 group-hover:text-base-content transition-all">
                                    <span className="text-sm">Generate Captions</span>
                                    <Icon icon="lucide--chevron-right" className="size-3.5" ariaLabel="Go" />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="bg-base-100 mt-6 card-border card">
                        <div className="p-3 card-body">
                            <textarea
                                className="m-0 p-1 border-0 focus:outline-none w-full h-24 text-base resize-none textarea"
                                placeholder="Let us know what you need..."
                            />
                            <div className="flex justify-between items-end mt-2">
                                <div className="inline-flex items-center gap-0.5">
                                    <button className="btn btn-sm btn-circle btn-ghost">
                                        <Icon icon="lucide--mic" className="size-4.5 text-base-content/80" ariaLabel="Record" />
                                    </button>
                                    <button className="btn btn-sm btn-circle btn-ghost">
                                        <Icon icon="lucide--image-plus" className="size-4.5 text-base-content/80" ariaLabel="Add image" />
                                    </button>
                                    <button className="btn btn-sm btn-circle btn-ghost">
                                        <Icon icon="lucide--paperclip" className="size-4.5 text-base-content/80" ariaLabel="Attach" />
                                    </button>
                                </div>
                                <div className="max-sm:hidden flex items-center font-medium text-xs text-base-content/60">
                                    Usage Limit: <span className="ms-1 text-error">Active</span>
                                    <div className="tooltip">
                                        <div className="bg-base-100 shadow p-3 font-normal text-base-content text-start tooltip-content">
                                            <p className="font-semibold">Usage Summary:</p>
                                            <p className="mt-2">Today: 47 tokens</p>
                                            <p className="mt-0.5">Total: 158 tokens</p>
                                        </div>
                                        <Icon icon="lucide--help-circle" className="block ms-1 size-3" ariaLabel="Help" />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button className="border-base-300 rounded-full btn-outline btn btn-sm max-sm:btn-circle">
                                        <Icon icon="lucide--globe" className="size-4 text-base-content/80" ariaLabel="Public" />
                                        <p className="max-sm:hidden">Search</p>
                                    </button>
                                    <button className="border-base-300 rounded-full btn-outline btn btn-sm max-sm:btn-circle">
                                        <Icon icon="lucide--brain-cog" className="size-4 text-base-content/80" ariaLabel="AI" />
                                        <p className="max-sm:hidden">Brainstorm</p>
                                    </button>
                                    <button className="btn btn-primary btn-circle btn-sm">
                                        <Icon icon="lucide--arrow-right" className="size-4" ariaLabel="Next" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default AiHomePage;

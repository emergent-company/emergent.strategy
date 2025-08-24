import { MetaData } from "@/components/MetaData";

const AiHomePage = () => {
    return (
        <>
            <MetaData title="Gen AI Home" />

            <div className="flex flex-col items-center justify-center md:mt-16 lg:mt-24 xl:mt-32">
                <div className="w-full sm:max-w-4xl">
                    <div className="from-base-content to-primary inline-block bg-gradient-to-tr from-40% bg-clip-text text-2xl font-semibold tracking-tight text-transparent sm:text-4xl">
                        <p>Hi there, Denish</p>
                        <p className="mt-1">How can I assist you today?</p>
                    </div>
                    <div className="mt-6 grid gap-6 md:grid-cols-3">
                        <div className="card group bg-base-100 card-border cursor-pointer transition-all">
                            <div className="card-body">
                                <div className="bg-primary text-primary-content rounded-box w-fit p-2">
                                    <span className="iconify lucide--sparkles block size-4"></span>
                                </div>
                                <p className="mt-3 font-medium">Blog Post Ideas</p>
                                <p className="text-base-content/80 mt-1 line-clamp-2 text-sm text-ellipsis">
                                    Generate compelling blog topics that captivate your audience and enhance SEO.
                                </p>
                                <div className="text-base-content/60 group-hover:text-base-content mt-3 flex items-center gap-1.5 transition-all">
                                    <span className="text-sm">Explore Ideas</span>
                                    <span className="iconify lucide--chevron-right size-3.5"></span>
                                </div>
                            </div>
                        </div>

                        <div className="card group bg-base-100 card-border cursor-pointer transition-all">
                            <div className="card-body">
                                <div className="bg-secondary text-secondary-content rounded-box w-fit p-2">
                                    <span className="iconify lucide--mail block size-4"></span>
                                </div>
                                <p className="mt-3 font-medium">Email Campaigns</p>
                                <p className="text-base-content/80 mt-1 line-clamp-2 text-sm text-ellipsis">
                                    Create high-converting email copy that boosts engagement and builds lasting
                                    connections.
                                </p>
                                <div className="text-base-content/60 group-hover:text-base-content mt-3 flex items-center gap-1.5 transition-all">
                                    <span className="text-sm">Start Campaign</span>
                                    <span className="iconify lucide--chevron-right size-3.5"></span>
                                </div>
                            </div>
                        </div>

                        <div className="card group bg-base-100 card-border cursor-pointer transition-all">
                            <div className="card-body">
                                <div className="bg-success text-success-content rounded-box w-fit p-2">
                                    <span className="iconify lucide--text block size-4"></span>
                                </div>
                                <p className="mt-3 font-medium">Social Media Captions</p>
                                <p className="text-base-content/80 mt-1 line-clamp-2 text-sm text-ellipsis">
                                    Generate catchy captions designed to maximize engagement across social platforms.
                                </p>
                                <div className="text-base-content/60 group-hover:text-base-content mt-3 flex items-center gap-1.5 transition-all">
                                    <span className="text-sm">Generate Captions</span>
                                    <span className="iconify lucide--chevron-right size-3.5"></span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="card bg-base-100 card-border mt-6">
                        <div className="card-body p-3">
                            <textarea
                                className="textarea m-0 h-24 w-full resize-none border-0 p-1 text-base focus:outline-none"
                                placeholder="Let us know what you need..."
                            />
                            <div className="mt-2 flex items-end justify-between">
                                <div className="inline-flex items-center gap-0.5">
                                    <button className="btn btn-sm btn-circle btn-ghost">
                                        <span className="iconify lucide--mic text-base-content/80 size-4.5"></span>
                                    </button>
                                    <button className="btn btn-sm btn-circle btn-ghost">
                                        <span className="iconify lucide--image-plus text-base-content/80 size-4.5"></span>
                                    </button>
                                    <button className="btn btn-sm btn-circle btn-ghost">
                                        <span className="iconify lucide--paperclip text-base-content/80 size-4.5"></span>
                                    </button>
                                </div>
                                <div className="text-base-content/60 flex items-center text-xs font-medium max-sm:hidden">
                                    Usage Limit: <span className="text-error ms-1">Active</span>
                                    <div className="tooltip">
                                        <div className="tooltip-content bg-base-100 text-base-content p-3 text-start font-normal shadow">
                                            <p className="font-semibold">Usage Summary:</p>
                                            <p className="mt-2">Today: 47 tokens</p>
                                            <p className="mt-0.5">Total: 158 tokens</p>
                                        </div>
                                        <span className="iconify lucide--help-circle ms-1 block size-3"></span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button className="btn btn-sm btn-outline border-base-300 max-sm:btn-circle rounded-full">
                                        <span className="iconify lucide--globe text-base-content/80 size-4"></span>
                                        <p className="max-sm:hidden">Search</p>
                                    </button>
                                    <button className="btn btn-sm btn-outline border-base-300 max-sm:btn-circle rounded-full">
                                        <span className="iconify lucide--brain-cog text-base-content/80 size-4"></span>
                                        <p className="max-sm:hidden">Brainstorm</p>
                                    </button>
                                    <button className="btn btn-primary btn-circle btn-sm">
                                        <span className="iconify lucide--arrow-right size-4"></span>
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
